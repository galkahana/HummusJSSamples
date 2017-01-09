var hummus = require('hummus'),
    _ = require('lodash');

/**
 * toText function. should get this into hummus proper sometimes
 */
function toText(item) {
    if(item.getType() === hummus.ePDFObjectLiteralString) {
        return item.toPDFLiteralString().toText();
    }
    else if(item.getType() === hummus.ePDFObjectHexString) {
        return item.toPDFHexString().toText();
    } else {
        return item.value;
    }
}

/**
 * a wonderfully reusable method to recreate a dict without all the keys that we want to change
 * note that it starts writing a dict, but doesn't finish it. your job
 */
function startModifiedDictionary(handles,originalDict,excludedKeys) {
    var originalDictJs = originalDict.toJSObject();
    var newDict = handles.objectsContext.startDictionary();

    Object.getOwnPropertyNames(originalDictJs).forEach(function(element,index,array) {
        if (!excludedKeys[element]) {
            newDict.writeKey(element);
            handles.copyingContext.copyDirectObjectAsIs(originalDictJs[element]);
        }
    });

    return newDict;
}

function writeRadioButtonValue(handles,targetFieldDictionary,sourceFieldDictionary,value) {
    if(value === null) {
        // false is easy, just write '/Off' as the value
        targetFieldDictionary
            .writeKey('V')
            .writeName('Off');

    } else {
        // great. have to get the non '/Off' appearance name of the radio button kid
        var apDictionary;

        var kidsArray = handles.reader.queryDictionaryObject(sourceFieldDictionary,'Kids').toPDFArray();
        var widgetDictionary = handles.reader.queryArrayObject(kidsArray,value).toPDFDictionary();
        var apDictionary = handles.reader.queryDictionaryObject(widgetDictionary,'AP').toPDFDictionary();
        var nAppearances = handles.reader.queryDictionaryObject(apDictionary,'N').toPDFDictionary().toJSObject();

        // should have two - one is off and the other is what we want
        targetFieldDictionary
            .writeKey('V')
            .writeNameValue(_.find(Object.keys(nAppearances),function(item){return item !== 'Off'}));

    }
}

function writeCheckboxButtonValue(handles,targetFieldDictionary,sourceFieldDictionary,value) {
    if(!value) {
        // false value is easy, just write '/Off' as the value
        targetFieldDictionary
            .writeKey('V')
            .writeName('Off');
    } else {
        // great. have to get the non '/Off' appearance name of the radio button appearance
        var apDictionary;
        if(sourceFieldDictionary.exists('Kids')) {
            // in case its in child widget
            var kidsArray = handles.reader.queryDictionaryObject(sourceFieldDictionary,'Kids').toPDFArray();
            var widgetDictionary = handles.reader.queryArrayObject(kidsArray,0).toPDFDictionary();
            var apDictionary = handles.reader.queryDictionaryObject(widgetDictionary,'AP').toPDFDictionary();
        } else {
            // in case the checkbox widget and field are combined, ap should be at this level
            var apDictionary = handles.reader.queryDictionaryObject(sourceFieldDictionary,'AP').toPDFDictionary();
        }
        var nAppearances = handles.reader.queryDictionaryObject(apDictionary,'N').toPDFDictionary().toJSObject();

        // should have two - one is off and the other is what we want
        targetFieldDictionary
            .writeKey('V')
            .writeNameValue(_.find(Object.keys(nAppearances),function(item){return item !== 'Off'}));
    }
}

function writeRichTextValue(handles,targetFieldDictionary,sourceFieldDictionary,value) {
    if(typeof(value) === 'string') {
        value = {v:value,rv:value};
    }

    targetFieldDictionary
        .writeKey('V')
        .writeLiteralStringValue(new hummus.PDFTextString(value['v']).toBytesArray());

    targetFieldDictionary
        .writeKey('RV')
        .writeLiteralStringValue(new hummus.PDFTextString(value['rv']).toBytesArray());
}

function writePlainTextValue(handles,targetFieldDictionary,sourceFieldDictionary,value) {
    targetFieldDictionary
        .writeKey('V')
        .writeLiteralStringValue(new hummus.PDFTextString(value).toBytesArray());    
}

function writeChoiceValue(handles,targetFieldDictionary,sourceFieldDictionary,value) {
    if(typeof(value) === 'string') {
        // one option
        targetFieldDictionary
            .writeKey('V')
            .writeLiteralStringValue(new hummus.PDFTextString(value).toBytesArray());    
    }
    else {
        // multiple options
        targetFieldDictionary
            .writeKey('V');
        handles.objectsContext.startArray();
        value.forEach(function(singleValue) {
            handles.objectsContext.writeLiteralString(new hummus.PDFTextString(singleValue).toBytesArray());    
        });
        handles.objectsContext.endArray();
    }
}


/**
 * write field value data, per the type of the control
 */
function writeFieldValueData(handles,targetFieldDictionary,sourceFieldDictionary,value,flags, inheritedProperties) {
    var localFieldType = sourceFieldDictionary.exists('FT') ? sourceFieldDictionary.queryObject('FT').toString():undefined,
        fieldType = localFieldType || inheritedProperties['FT'];

    if(!fieldType)
        return; // k. must be a widget, i'm gone
    
    switch(fieldType) {
        case 'Btn': {
			if((flags>>16) & 1)
			{
				// push button. can't write a value. forget it. should throw or return an error sometimes
                ['V','RV'].forEach(function(key) {
                    if(sourceFieldDictionary.exists(key)) {
                        targetFieldDictionary.writeKey(key);
                        handles.copyingContext.copyDirectObjectAsIs(sourceFieldDictionary.queryObject(key));
                    }
                });                
			}
			else if((flags>>15) & 1)
			{
                // radio button
                writeRadioButtonValue(handles,targetFieldDictionary,sourceFieldDictionary,value);
			}
			else 
			{

                // checkbox button
                writeCheckboxButtonValue(handles,targetFieldDictionary,sourceFieldDictionary,value);
			}
            break;
        }
        case 'Tx': {
			if((flags>>25) & 1) {
                writeRichTextValue(handles,targetFieldDictionary,sourceFieldDictionary,value);
            } else {
                writePlainTextValue(handles,targetFieldDictionary,sourceFieldDictionary,value);
            }

            break;
        }
        case 'Ch': {
            writeChoiceValue(handles,targetFieldDictionary,sourceFieldDictionary,value);
            break;
        }
        case 'Sig': {
			// signature, ain't handling that. should return or throw an error sometimes
            ['V','RV'].forEach(function(key) {
                if(sourceFieldDictionary.exists(key)) {
                    targetFieldDictionary.writeKey(key);
                    handles.copyingContext.copyDirectObjectAsIs(sourceFieldDictionary.queryObject(key));
                }
            });            
            break;
        }
    }


    /*
    ['V','RV'].forEach(function(key) {
        if(sourceFieldDictionary.exists(key)) {
            targetFieldDictionary.writeKey(key);
            handles.copyingContext.copyDirectObjectAsIs(sourceFieldDictionary.queryObject(key));
        }
    });    */
}

/**
 * writes a single field. will fill with value if found in data.
 * assuming that's in indirect object and having to write the dict,finish the dict, indirect object and write the kids
 */
function writeFilledField(handles,fieldDictionary,inheritedProperties,baseFieldName) {
    var localFieldNameT = fieldDictionary.exists('T') ? toText(fieldDictionary.queryObject('T')):undefined,
        fullName = localFieldNameT === undefined ? undefined : (baseFieldName + localFieldNameT),
		localFlags = fieldDictionary.exists('Ff') ? fieldDictionary.queryObject('Ff').toNumber():undefined,
        flags = (localFlags === undefined ? inheritedProperties['Ff'] : localFlags) || 0;

    var modifiedFieldDict = startModifiedDictionary(handles,fieldDictionary,{'Kids':-1,'V':-1,'RV':-1});
    var kids = fieldDictionary.exists('Kids') ? 
                        handles.reader.queryDictionaryObject(fieldDictionary,'Kids').toPDFArray() :
                        null;

    // i'm gonna assume that if there's no T and no kids, this is a widget annotation WHICH IS NOT a field and i'm out of here
    if(localFieldNameT === undefined && 
        !fieldDictionary.exists('Kids') && 
        fieldDictionary.exists('Subtype') && 
        fieldDictionary.queryObject('Subtype').toString() == 'Widget') {
            handles.objectsContext
                .endDictionary(modifiedFieldDict)
                .endIndirectObject();
        }

    if(handles.data[fullName]) {
        // we got a winner. let's set its value
        writeFieldValueData(handles,modifiedFieldDict,fieldDictionary,handles.data[fullName],flags, inheritedProperties);

        // TODO: On occasion i may need to write a new appearance stream. we'll take care of that later.
    }
    else {
        // write the fields that we didn't write earlier, unchanged
        ['V','RV'].forEach(function(key) {
            if(fieldDictionary.exists(key)) {
                modifiedFieldDict.writeKey(key);
                handles.copyingContext.copyDirectObjectAsIs(fieldDictionary.queryObject(key));
            }
        });
    }
    

    // if kids exist, continue to them for extra filling!
    if(kids) {
        var localEnv = {}
        
        // prep some inherited values and push env
        if(fieldDictionary.exists('FT'))
            localEnv['FT'] = fieldDictionary.queryObject('FT').toString();
        if(fieldDictionary.exists('Ff'))
            localEnv['Ff'] = fieldDictionary.queryObject('Ff').toNumber();
        if(fieldDictionary.exists('DA'))
            localEnv['DA'] = toText(fieldDictionary.queryObject('DA'));
        if(fieldDictionary.exists('Opt'))
            localEnv['Opt'] = fieldDictionary.queryObject('Opt').toPDFArray();

        modifiedAcroFormDict.writeKey('Kids');
        // recurse to kids
        writeFilledFields(handles,modifiedAcroFormDict,kids,_.extend({},inheritedProperties,localEnv),baseFieldName + localFieldNameT + '.'); 
    } else {
        handles.objectsContext
            .endDictionary(modifiedFieldDict)
            .endIndirectObject();
    }
}

/**
 * write fields/kids array of dictionary. make sure all become indirect, for the sake of simplicity,
 * which is why it gets to take care of finishing the writing of the said dict
 */
function writeFilledFields(handles,parentDict,fields,inheritedProperties,baseFieldName) {
    var fieldJSArray = fields.toJSArray();
    var fieldsReferences = [];

    // recreate fields arrays. where a direct object - recreate as indirect reference
    handles.objectsContext.startArray();
    fieldJSArray.forEach(function(field) {
        if(field.getType() === hummus.ePDFObjectIndirectObjectReference) {
            // existing reference, keep as is
            handles.copyingContext.copyDirectObjectAsIs(field);
            fieldsReferences.push({existing:true,id:field.toPDFIndirectObjectReference().getObjectID()});
        }
        else {
            var newFieldObjectId = handles.objectsContext.allocateNewObjectID();
            // direct object, recreate as reference
            fieldsReferences.push({existing:false,id:newFieldObjectId,theObject:field});
            handles.copyingContext.writeIndirectObjectReference(newFieldObjectId);
        }
    });
	handles.objectsContext
                .endArray(hummus.eTokenSeparatorEndLine)
                .endDictionary(parentDict)
                .endIndirectObject();

    // now recreate the fields, filled this time (and down the recursion hole...)
    fieldsReferences.forEach(function(fieldReference) {
        if(fieldReference.existing) {
            handles.objectsContext.startModifiedIndirectObject(fieldReference.id);
            writeFilledField(handles,handles.reader.parseNewObject(fieldReference.id).toPDFDictionary(),inheritedProperties,baseFieldName);
        }
        else {
            handles.objectsContext.startNewIndirectObject(fieldReference.id);
            writeFilledField(handles,fieldReference.field.toPDFDictionary(),inheritedProperties,baseFieldName);
        }
    });
}

/**
 * Write a filled form dictionary, and its subordinate fields.
 * assumes in an indirect object, so will finish it
 */
function writeFilledForm(handles,acroformDict) {
    var modifiedAcroFormDict = startModifiedDictionary(handles,acroformDict,{'Fields':-1});

    var fields = acroformDict.exists('Fields') ? 
                        handles.reader.queryDictionaryObject(acroformDict,'Fields').toPDFArray() :
                        null;

    if(fields) {
        modifiedAcroFormDict.writeKey('Fields');
        writeFilledFields(handles,modifiedAcroFormDict,fields,{},''); // will also take care of finishing the dictionary and indirect object, so no need to finish after
    } else {
        handles
            .objectsContext.endDictionary(modifiedAcroFormDict)
            .objectsContext.endIndirectObject();
    }
}

function fillForm(writer,data) {
    // setup parser
    var reader =  writer.getModifiedFileParser();

    // start out by finding the acrobat form
    var catalogDict =  reader.queryDictionaryObject(reader.getTrailer(),'Root').toPDFDictionary(),
        acroformInCatalog = catalogDict.exists('AcroForm') ? catalogDict.queryObject('AcroForm'):null;

    if(!acroformInCatalog) 
        return new Error('form not found!');
    
    // setup copying context, and keep reference to objects context as well
    var copyingContext = writer.createPDFCopyingContextForModifiedFile();
    var objectsContext = writer.getObjectsContext();

    // lets put all the basics in a nice "handles" package, so we don't have to pass each of them all the time
    var handles = {
        writer:writer,
        reader:reader,
        copyingContext:copyingContext,
        objectsContext:objectsContext,
        data:data
    };

    // parse the acroform dict
    var acroformDict = catalogDict.exists('AcroForm') ? reader.queryDictionaryObject(catalogDict,'AcroForm'):null;

    // recreate a copy of the existing form, which we will fill with data. 
    if(acroformInCatalog.getType() === hummus.ePDFObjectIndirectObjectReference) {
        // if the form is a referenced object, modify it
        var acroformObjectId = acroformInCatalog.toPDFIndirectObjectReference().getObjectID();
        objectsContext.startModifiedIndirectObject(acroformObjectId);

        writeFilledForm(handles,acroformDict);
    } else {
        // otherwise, recreate the form as an indirect child (this is going to be a general policy, we're making things indirect. it's simpler), and recreate the catalog
        var catalogObjectId = reader.getTrailer().queryObject('Root').toPDFIndirectObjectReference().getObjectID();
        var newAcroformObjectId = objectsContext.allocateNewObjectID();

        // recreate the catalog with form pointing to new reference
        objectsContext.startModifiedIndirectObject(catalogObjectId);
        modifiedCatalogDictionary = startModifiedDictionary(handles,catalogDict,{'AcroForm':-1});

        modifiedCatalogDictionary.writeKey('AcroForm');
        modifiedCatalogDictionary.writeObjectReferenceValue(newAcroformObjectId);
        objectsContext
            .endDictionary(modifiedCatalogDictionary)
            .endIndirectObject();

        // now create the new form object
        objectsContext.startNewIndirectObject(newAcroformObjectId);

        writeFilledForm(handles,acroformDict);
    }
}

module.exports = {
    fillForm:fillForm
}