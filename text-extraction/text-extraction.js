var hummus = require('hummus');
var _ = require('lodash');
var extractPlacements = require('./placements-extraction');
var transformations = require('./transformations');
var CollectionState = require('./collection-state');
var FontDecoding = require('./font-decoding');

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

function Tc(charSpace) {
    state.currentTextState().charSpace = charSpace;
}

function Tw(wordSpace) {
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
    Td(state.currentTextState().leading);
}

function Quote(text,state,placements) {
    TStar(state);
    textPlacement(text,state,placements);
}

function textPlacement(input,state,placements) {
    var item = {
            text:input,
            ctm:state.currentGraphicState().ctm,
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
                    placements.push({
                        type:'xobject',
                        objectId:resources.forms[operands[0].value].id,
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
                state.currentTextState().horizontalScaling = operands[0].value;
                break;
            }
            case 'TL': {
                TL(operands[0].value);
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
                td(operands[0].value,operands[1].value,state);
                break;
            }
            case 'TD': {
                TL(-operands[1].value);
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
                textPlacement({asEncodedText:operands[0].value,asBytes:operands[0].toBytesArray()},state,placements);
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
                var params = operands[0].toArray().toJSArray();
                textPlacement(_.map(params,(item)=>{
                    if(item.getType() === hummus.ePDFLiteralString || item.getType() === hummus.ePDFHexString) 
                        return {asEncodedText:item.value,asBytes:item.toBytesArray()};
                    else
                        return item.value;
                }),state,placements);
                break;
            }
        }
    };
}

function translatePlacements(state,pdfReader,placements) {
    // iterate the placements, getting the texts and translating them
    placements.forEach((placement)=> {
        if(placement.type === 'text') {
            placement.text.forEach((item)=> {
                if(!state.fontDecoders[item.textState.font.reference]) {
                    state.fontDecoders[item.textState.font.reference] = new FontDecoding(pdfReader,item.textState.font.reference);
                }
                var decoder = state.fontDecoders[item.textState.font.reference];
                item.text.asText = decoder.translate(item.text.asBytes);
            });
        }
    });
}

function translate(pdfReader,pagesPlacements,formsPlacements) {
    var state = {fontDecoders:{}};

    pagesPlacements.forEach((placements)=>{translatePlacements(state,pdfReader,placements)});
    _.forOwn(formsPlacements,(placements,objectId)=>{translatePlacements(state,pdfReader,placements)});

    return {
        pagesPlacements,
        formsPlacements
    };
}

function extractText(pdfReader) {
    // 1st phase - extract placements
    var {pagesPlacements,formsPlacements} = extractPlacements(pdfReader,collectPlacements,readResources);
    // 2nd phase - translate encoded bytes to text strings. mutating the objects!
    return translate(pdfReader,pagesPlacements,formsPlacements);
}

module.exports = extractText;
