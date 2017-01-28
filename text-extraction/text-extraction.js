var hummus = require('hummus');
var _ = require('lodash');
var extractPlacements = require('./placements-extraction');
var transformations = require('./transformations');
var CollectionState = require('./collection-state');
var FontDecoding = require('./font-decoding');

function toUnsignedCharsArray(charsArray) {
    return _.map(charsArray,(char)=> {return char < 0 ? (char+256):char})
}

function readResources(resources,pdfReader,result) {
    var extGStates = {};
    var fonts = {};

    if(resources.exists('ExtGState')) {
        var extGStatesEntry = pdfReader.queryDictionaryObject(resources,'ExtGState');
        if(!!extGStatesEntry) {
            var extGStatesJS = extGStatesEntry.toPDFDictionary().toJSObject();
            _.forOwn(extGStatesJS,(extGState,extGStateName)=>{
                if(extGState.getType() === hummus.ePDFIndirectObjectReference) {
                    extGState = pdfReader.parseNewObject(extGState.toPDFIndirectObjectReference().getObjectID()).toPDFDictionary();
                }
                else {
                    extGState = pdfReader.parseNewObject(extGState.toPDFIndirectObjectReference().getObjectID()).toPDFDictionary();
                }

                if(!!extGState) {
                    var item = {
                        theObject: extGState
                    };
                    // all i care about are font entries, so store it so i dont have to parse later (will cause trouble with interpretation)
                    if(extGState.exists('Font')) {
                        var fontEntry = pdfReader.queryDictionaryObject(extGState.toPDFDictionary(),'Font');
                        item.font = {
                            reference:fontEntry.queryObject[0].toPDFIndirectObjectReference().getObjectID(),
                            size:fontEntry.queryObject[1].value
                        };
                    }

                    extGStates[extGStateName] = item;
                }
            });
        }
    } 

    if(resources.exists('Font')) {
        var fontsEntry = pdfReader.queryDictionaryObject(resources,'Font');
        if(!!fontsEntry) {
            var fontsJS = fontsEntry.toPDFDictionary().toJSObject();
            _.forOwn(fontsJS,(fontReference,fontName)=>{
                fonts[fontName] = fontReference.toPDFIndirectObjectReference().getObjectID();
            });
        }
    }    

    result.extGStates = extGStates;
    result.fonts = fonts;
}

function Tc(charSpace,state) {
    state.currentTextState().charSpace = charSpace;
}

function Tw(wordSpace,state) {
    state.currentTextState().wordSpace = wordSpace;
}


function setTm(newM,state) {
    var currentTextEnv = state.currentTextState();
    currentTextEnv.tlm = newM.slice();
    currentTextEnv.tm = newM.slice();
    currentTextEnv.tmDirty = true;
    currentTextEnv.tlmDirty = true;
}

function Td(tx,ty,state) {
    setTm(transformations.multiplyMatrix([1,0,0,1,tx,ty],state.currentTextState().tlm),state);
}

function TL(leading,state) {
    state.currentTextState().leading = leading;
}

function TStar(state) {
    // there's an error in the book explanation
    // but we know better. leading goes below,
    // not up. this is further explicated by
    // the TD explanation
    Td(0,-state.currentTextState().leading,state);
}

function Quote(text,state,placements) {
    TStar(state);
    textPlacement(text,state,placements);
}

function textPlacement(input,state,placements) {
    var item = {
            text:input,
            ctm:state.currentGraphicState().ctm.slice(),
            textState:state.cloneCurrentTextState()
        };
        state.currentTextState().tmDirty = false;
        state.currentTextState().tlmDirty = false;
    state.texts.push(item);
}

function collectPlacements(resources,placements,formsUsed) {
    var state = new CollectionState();

    return (operatorName,operands)=> {
        switch(operatorName) {
            // Graphic State Operators
            case 'q': {
                state.pushGraphicState();
                break;
            }

            case 'Q': {
                state.popGraphicState();
                break;
            }

            case 'cm': {
                var newMatrix = _.map(operands,item => item.value);
                state.currentGraphicState().ctm = transformations.multiplyMatrix(newMatrix,state.currentGraphicState().ctm);
                break;
            }

            case 'gs': {
                if(resources.extGStates[operands[0].value]) {
                    if(resources.extGStates[operands[0].value].font)
                        state.currentTextState().text.font = _.extend({},resources.extGStates[operands[0].value].font);
                }
                break;
            }

            // XObject placement
            case 'Do': {
                // add placement, if form, and mark for later inspection
                if(resources.forms[operands[0].value]) {
                    var form = resources.forms[operands[0].value];
                    placements.push({
                        type:'xobject',
                        objectId:form.id,
                        matrix: form.matrix ? form.matrix.slice():null,
                        ctm:state.currentGraphicState().ctm.slice()
                    });
                    // add for later inspection (helping the extraction method a bit..[can i factor out? interesting enough?])
                    formsUsed[resources.forms[operands[0].value].id] = resources.forms[operands[0].value].xobject;
                }
                break;
            }

            // Text State Operators
            case 'Tc': {
                Tc(operands[0].value,state);
                break;
            }
            case 'Tw': {
                Tw(operands[0].value,state);
                break;
            }
            case 'Tz': {
                state.currentTextState().scale = operands[0].value;
                break;
            }
            case 'TL': {
                TL(operands[0].value,state);
                break;
            }     
            case 'Ts': {
                state.currentTextState().rise = operands[0].value;
                break;
            }     
            case 'Tf': {
                if(resources.fonts[operands[0].value]) {
                    state.currentTextState().font = {
                        reference:resources.fonts[operands[0].value],
                        size: operands[1].value
                    }
                }
                break;
            }   

            // Text elements operators
            case 'BT': {
                state.startTextElement();
                break;
            }

            case 'ET': {
                state.endTextElement(placements);
                break;
            }

            // Text positioining operators
            case 'Td': {
                Td(operands[0].value,operands[1].value,state);
                break;
            }
            case 'TD': {
                TL(-operands[1].value,state);
                Td(operands[0].value,operands[1].value,state);
                break;
            }
            case 'Tm': {
                setTm(_.map(operands,item => item.value),state);
                break;
            }
            case 'T*': {
                TStar(state);
                break;
            }

            // Text placement operators
            case 'Tj': {
                textPlacement({asEncodedText:operands[0].value,asBytes:toUnsignedCharsArray(operands[0].toBytesArray())},state,placements);
                break;
            }
            case '\'': {
                Quote(operands[0].value,state,placements);
                break;
            }
            case '"': {
                 Tw(operands[0].value,state);
                 Tc(operands[1].value,state);
                 Quote(operands[2].value,state,placements);
                break;
            }
            case 'TJ': {
                var params = operands[0].toPDFArray().toJSArray();
                textPlacement(_.map(params,(item)=>{
                    if(item.getType() === hummus.ePDFObjectLiteralString || item.getType() === hummus.ePDFObjectHexString) 
                        return {asEncodedText:item.value,asBytes:toUnsignedCharsArray(item.toBytesArray())};
                    else
                        return item.value;
                }),state,placements);
                break;
            }
        }
    };
}

function fetchFontDecoder(item,pdfReader,state) {
    if(!state.fontDecoders[item.textState.font.reference]) {
        state.fontDecoders[item.textState.font.reference] = new FontDecoding(pdfReader,item.textState.font.reference);
    }
    return state.fontDecoders[item.textState.font.reference];
}

function translateText(pdfReader,textItem,state,item) {
    var decoder = fetchFontDecoder(item, pdfReader, state);
    var translation = decoder.translate(textItem.asBytes);
    textItem.asText = translation.result;
    textItem.translationMethod = translation.method;
}

function translatePlacements(state,pdfReader,placements) {
    // iterate the placements, getting the texts and translating them
    placements.forEach((placement)=> {
        if(placement.type === 'text') {
            placement.text.forEach((item)=> {
                if(_.isArray(item.text)) {
                    // TJ case

                    // save all text
                    var allText = _.reduce(item.text,(result,textItem)=> {
                        if(textItem.asBytes) {
                            return result.concat(textItem.asBytes);
                        }
                        else
                            return result;
                    },[]);
                    item.allText = {
                        asBytes : allText
                    };
                    translateText(pdfReader,item.allText,state,item);
                    
                    // also parts
                    item.text.forEach((textItem)=> {
                        if(textItem.asBytes) {
                            // in case it's text and not position change
                            translateText(pdfReader,textItem,state,item);
                        }
                    });

                }
                else {
                    // Tj case
                    translateText(pdfReader,item.text,state,item);
                }
            });
        }
    });
}

function translate(state,pdfReader,pagesPlacements,formsPlacements) {
    pagesPlacements.forEach((placements)=>{translatePlacements(state,pdfReader,placements)});
    _.forOwn(formsPlacements,(placements,objectId)=>{translatePlacements(state,pdfReader,placements)});

    return {
        pagesPlacements,
        formsPlacements
    };
}

function computePlacementsDimensions(state, pdfReader, placements) {
    // iterate the placements computing bounding boxes
    placements.forEach((placement)=> {
        if(placement.type === 'text') {
            // this is a BT..ET sequance 
            var nextPlacementDefaultTm = null;
            placement.text.forEach((item)=> {
                // if matrix is not dirty (no matrix changing operators were running betwee items), replace with computed matrix of the previous round.
                if(!item.textState.tmDirty && nextPlacementDefaultTm)
                    item.textState.tm = nextPlacementDefaultTm.slice();

                // Compute matrix and placement after this text
                var decoder = fetchFontDecoder(item, pdfReader, state);

                var accumulatedDisplacement = 0;
                var minPlacement = 0;
                var maxPlacement = 0;
                nextPlacementDefaultTm = item.textState.tm;
                if(_.isArray(item.text)) {
                    // TJ
                    item.text.forEach((textItem)=> {
                        if(textItem.asBytes) {
                             // marks a string
                            decoder.iterateTextDisplacements(textItem.asBytes,(displacement,charCode)=> {
                                var tx = (displacement*item.textState.font.size + item.textState.charSpace + (charCode === 32 ? item.textState.wordSpace:0))*item.textState.scale/100;
                                accumulatedDisplacement+=tx;
                                if(accumulatedDisplacement<minPlacement)
                                    minPlacement = accumulatedDisplacement;
                                if(accumulatedDisplacement>maxPlacement)
                                    maxPlacement = accumulatedDisplacement;
                                nextPlacementDefaultTm = transformations.multiplyMatrix([1,0,0,1,tx,0],nextPlacementDefaultTm);
                            });
                        }
                        else {
                            var tx = ((-textItem/1000)*item.textState.font.size)*item.textState.scale/100;
                            accumulatedDisplacement+=tx;
                            if(accumulatedDisplacement<minPlacement)
                                minPlacement = accumulatedDisplacement;
                            if(accumulatedDisplacement>maxPlacement)
                                maxPlacement = accumulatedDisplacement;
                            nextPlacementDefaultTm = transformations.multiplyMatrix([1,0,0,1,tx,0],nextPlacementDefaultTm);
                        }
                    });
                }
                else {
                    // Tj case
                    decoder.iterateTextDisplacements(item.text.asBytes,(displacement,charCode)=> {
                        var tx = (displacement*item.textState.font.size + item.textState.charSpace + (charCode === 32 ? item.textState.wordSpace:0))*item.textState.scale/100;

                        accumulatedDisplacement+=tx;
                        if(accumulatedDisplacement<minPlacement)
                            minPlacement = accumulatedDisplacement;
                        if(accumulatedDisplacement>maxPlacement)
                            maxPlacement = accumulatedDisplacement;
                        nextPlacementDefaultTm = transformations.multiplyMatrix([1,0,0,1,tx,0],nextPlacementDefaultTm);
                    });
                }
                item.textState.tmAtEnd = nextPlacementDefaultTm.slice();
                item.displacement = accumulatedDisplacement;
                var descentPlacement = ((decoder.descent || 0) + item.textState.rise)*item.textState.font.size/1000;
                var ascentPlacement = ((decoder.ascent) || 0 + item.textState.rise)*item.textState.font.size/1000;
                item.localBBox = [minPlacement,descentPlacement,maxPlacement,ascentPlacement];
            });
        }
    });
}

function computeDimensions(state,pdfReader,pagesPlacements,formsPlacements) {
    pagesPlacements.forEach((placements)=>{computePlacementsDimensions(state,pdfReader,placements)});
    _.forOwn(formsPlacements,(placements,objectId)=>{computePlacementsDimensions(state,pdfReader,placements)});

    return {
        pagesPlacements,
        formsPlacements
    };
}

function resolveForm(formObjectId,formsPlacements,resolvedForms) {
    if(!resolvedForms[formObjectId]) {
        resolvedForms[formObjectId] = true;
        formsPlacements[formObjectId] = resolveFormPlacements(formsPlacements[formObjectId]);
    }
    return formsPlacements[formObjectId];
}

function resolveFormPlacements(objectPlacements,formsPlacements,resolvedForms) {
    for(var i=objectPlacements.length-1;i>=0;--i) {
        var placement = objectPlacements[i];
        if(placement.type === 'xobject') {
            // make sure form is resolved in itself
            var resolvedFormPlacements = resolveForm(placement.objectId,formsPlacements,resolvedForms);
            // grab its placements and make them our own
            var newPlacements = [i,1];
            resolvedFormPlacements.forEach((formTextPlacement)=> {
                // all of them have to be text placements now, cause it's resolved
                var clonedPlacemet = _.cloneDeep(formTextPlacement);
                // multiply with this placement CTM, and insert at this point
                clonedPlacemet.text.forEach((textPlacement)=> {
                    var formMatrix = placement.matrix ? transformations.multiplyMatrix(placement.matrix,placement.ctm):placement.ctm;
                    textPlacement.ctm = transformations.multiplyMatrix(textPlacements.ctm,formMatrix);
                });
                newPlacements.push(clonedPlacemet);
            });
            // replace xobject placement with new text placements
            objectPlacements.splice.apply(objectPlacements,newPlacements);
        }
    }
    return objectPlacements;
}

function mergeForms(pagesPlacements,formsPlacements) {
    var state = {};

    // replace forms placements with their text placements
    return _.map(pagesPlacements,(pagePlacements)=> {return resolveFormPlacements(pagePlacements,formsPlacements,state);});
}

function flattenPlacements(pagesPlacements) {
    return _.map(pagesPlacements,(pagePlacements)=> {
        return _.reduce(pagePlacements,(result,pagePlacement)=> {
            var textPlacements = _.map(pagePlacement.text,(textPlacement)=> {
                var matrix = transformations.multiplyMatrix(textPlacement.textState.tm,textPlacement.ctm);
                var newPlacement = {
                    text: textPlacement.allText ? textPlacement.allText.asText : textPlacement.text.asText,
                    matrix:matrix,
                    localBBox: textPlacement.localBBox.slice(),
                    globalBBox: transformations.transformBox(textPlacement.localBBox,matrix)
                }
                return newPlacement;
            });
            return result.concat(textPlacements);
        },[]);
    });
}

/**
 * Extracts text from all pages of the pdf.
 * end result is an array matching the pages of the pdf.
 * each item has an array of text placements.
 * each text placement is of the form:
 * {
 *      text: the text
 *      matrix: 6 numbers pdf matrix describing how the text is transformed in relation to the page (this includes position - translation)
 *      localBBox: 4 numbers box describing the text bounding box, before being transformed by matrix.
 *      globalBBox: 4 numbers box describing the text bounding box after transoformation, making it the bbox in relation to the page.
 *      
 * }
 */
function extractText(pdfReader) {
    // 1st phase - extract placements
    var {pagesPlacements,formsPlacements} = extractPlacements(pdfReader,collectPlacements,readResources);
    // 2nd phase - translate encoded bytes to text strings.
    var state = {fontDecoders:{}};
    translate(state,pdfReader,pagesPlacements,formsPlacements);
    // 3rd phase - compute dimensions
    computeDimensions(state,pdfReader,pagesPlacements,formsPlacements);
    // 4th phase - merge xobject forms
    pagesPlacements =  mergeForms(pagesPlacements,formsPlacements);
    // 5th phase - flatten page placments, and simplify constructs
    return flattenPlacements(pagesPlacements);
}

module.exports = extractText;
