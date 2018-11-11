var hummus = require('hummus')
var _ = require('lodash')

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

function collectWidgetAnnotations(reader, pageDictionary) {
    // look for widget annotations, which are the form fields presentation on the page. we need to turn
    // them to simple overlays of appearance graphics, instead of the original interactive object.
    // hance - remove the annotation, and replace with graphic overlay of placing its appearance form
    var widgetAnnotatons = []
    if(pageDictionary.exists('Annots')) {
        var annotationsArray = reader.queryDictionaryObject(pageDictionary,'Annots').toPDFArray();
        for(var i = 0; i < annotationsArray.getLength();++i) {
            var annotationObject = reader.queryArrayObject(annotationsArray,i).toPDFDictionary();
            var isWidget =  annotationObject.queryObject('Subtype').toString() == 'Widget';
            if(isWidget) {
                // find the appearance xobject id that represents this annoation appearance
                var apDictionary = reader.queryDictionaryObject(annotationObject,'AP').toPDFDictionary();
                var nAppearances = reader.queryDictionaryObject(apDictionary,'N');
                if(nAppearances.getType() === hummus.ePDFObjectDictionary) {
                    var nAppearancesDict = nAppearances.toPDFDictionary().toJSObject();
                    var appearanceObjectId = null;
                    if(Object.keys(nAppearancesDict).length === 1) {
                        // if one appearance in nAppearances, than it is the appearance stream to use. keep it
                        appearanceObjectId = nAppearancesDict[Object.keys(nAppearancesDict)[0]].toPDFIndirectObjectReference().getObjectID();
                    }
                    else {
                        // otherwise, consult AS entry for the one to take
                        if(annotationObject.exists('AS')) {
                            var appearanceName = annotationObject.queryObject('AS').toString();
                            appearanceObjectId = nAppearancesDict[appearanceName].toPDFIndirectObjectReference().getObjectID()
                        }
                    }
                }
                else {
                    // stream, this means a single appearance. record its object Id
                    appearanceObjectId = apDictionary.queryObject('N').toPDFIndirectObjectReference().getObjectID();
                }
                if(appearanceObjectId)
                    widgetAnnotatons.push({
                        id:appearanceObjectId,
                        rect: _.map(reader.queryDictionaryObject(annotationObject,'Rect').toPDFArray().toJSArray(),function(item){return item.toNumber()})
                    })
            }
        }
    } 
    
    return widgetAnnotatons;   
}

function writeNewXObjectsWithPrefix(xobjects, prefix,widgetAnnoations) {
    var results = [];
    widgetAnnoations.forEach(function(item,index) {
        formObjectName = prefix + '_'  + index;
        xobjects.writeKey(formObjectName);
        xobjects.writeObjectReferenceValue(item.id);
        results.push({
            name:formObjectName,
            rect:item.rect
        });
    });
    return results;
}

function writeNewXObjectDict(resources, objectsContext,widgetAnnoations) {
    var results = [];
    resources.writeKey('XObject');
    xobjects = objectsContext.startDictionary();
    results = writeNewXObjectsWithPrefix(xobjects,'myForm', widgetAnnoations);
    objectsContext.endDictionary(xobjects);
    return results;
}

function writeNewResourcesDictionary(objectsContext,widgetAnnoations) {
    resources = objectsContext.startDictionary();
    var results = writeNewXObjectDict(resources,objectsContext,widgetAnnoations);
    objectsContext.endDictionary(resources);

    return results;
}

function findInheritedResources(reader,dict) {
    if(dict.exists('Resources')) {
        return reader.queryDictionaryObject(dict,'Resources').toPDFDictionary();
    }
    else {
        var parentDict = dict.exists('Parent') ? reader.queryDictionaryObject(dict,'Parent').toPDFDictionary() : null;
        if(!parentDict)
            return null
        return findInheritedResources(reader,parentDict)
    }
}

function getDifferentChar(inCharCode) {
    // numerals
    if(inCharCode >= 0x30 && inCharCode <= 0x38)
        return inCharCode+1;
    if(inCharCode == 0x39)
        return 0x30;

    // lowercase
    if(inCharCode >= 0x61 && inCharCode <= 0x79)
        return inCharCode+1;
    if(inCharCode == 0x7a)
        return 0x61;

    // uppercase
    if(inCharCode >= 0x41 && inCharCode <= 0x59)
        return inCharCode+1;
    if(inCharCode == 0x5a)
        return 0x41;

    return 0x41;    
}

function writeModifiedResourcesDict(handles, resources, widgetAnnoations) {
    var results;
    var objectsContext = handles.objectsContext;
    var reader = handles.reader;
    var copyingContext = handles.copyingContext;

    var modifiedResourcesDict = startModifiedDictionary(handles,resources,{'XObject':-1})
    
    if(resources.exists('XObject')){
        modifiedResourcesDict.writeKey('XObject');
        xobjects = objectsContext.startDictionary();
        var existingXObjectsDict = reader.queryDictionaryObject(resources,'XObject').toPDFDictionary().toJSObject();
        // copy existing names, while at it creating a new different prefix name for new xobjects
        var i = 0;
        var newObjectPrefix = ''
        Object.getOwnPropertyNames(existingXObjectsDict).forEach(function(name) {
            xobjects.writeKey(name);
            copyingContext.copyDirectObjectAsIs(existingXObjectsDict[name]);
            newObjectPrefix += String.fromCharCode(getDifferentChar((name.length >= i+1) ? name.charCodeAt(i): 0x39));
            ++i;
        });
        
        results = writeNewXObjectsWithPrefix(xobjects,newObjectPrefix, widgetAnnoations);
        objectsContext.endDictionary(xobjects);
    }
    else {
        results = writeNewXObjectDict(resources,objectsContext,widgetAnnoations);
    }
    objectsContext
        .endDictionary(modifiedResourcesDict)
    return results;
}


function writeToStreamCxt(streamCxt,str) {
    var bytes = [];
    for (var i = 0; i < str.length; ++i) {
      var code = str.charCodeAt(i);
      bytes = bytes.concat([code]);
    }
    streamCxt.getWriteStream().write(bytes)
}

function lockWidgetAnnotationsForPage(handles,pageObjectId,pageDictionary,widgetAnnotatons) {
    if(widgetAnnotatons.length == 0) // nothing much to do here without widget annoations. so let's keep this for "at least one"
        return;

    var objectsContext = handles.objectsContext;
    var copyingContext = handles.copyingContext;
    var reader = handles.reader;
    

    // rewrite page object. we'll need to remove the widget annotations, create new content overlay
    // and add annotation forms to the page resources dict...easy 
    objectsContext.startModifiedIndirectObject(pageObjectId);
    modifiedPageDictionary = startModifiedDictionary(handles,pageDictionary,{'Annots':-1, 'Resources': -1, 'Contents': -1});

    // 1. rewrite the annots entry, without the widget annotations (don't mind if it's empty now)
    modifiedPageDictionary.writeKey('Annots');
    objectsContext.startArray();
    var annotationsArray = reader.queryDictionaryObject(pageDictionary,'Annots').toPDFArray();
    for(var i = 0; i < annotationsArray.getLength();++i) {
        var annotationObject = reader.queryArrayObject(annotationsArray,i).toPDFDictionary();
        var isWidget =  annotationObject.queryObject('Subtype').toString() == 'Widget';
        if(!isWidget) {
            copyingContext.copyDirectObjectAsIs(annotationObject);
        }
    }
    objectsContext.endArray();
    objectsContext.endLine();

    // 2. write new contents entry, with a new overlay entry

    // Content IDs that we'll use to introduce new overlay (the pre one is just to protect the matrix)
    var preContent = objectsContext.allocateNewObjectID();
    var postContent = objectsContext.allocateNewObjectID();
    
    var existingContentsStreamsIds = [];
    if(pageDictionary.exists('Contents')) {
        var contents = reader.queryDictionaryObject(pageDictionary,'Contents')
        if(contents.getType() === hummus.ePDFObjectStream) {
            // single content stream case
            existingContentsStreamsIds.push(
                pageDictionary.queryObject('Contents').toPDFIndirectObjectReference().getObjectID()
            )
        }
        else if(contents.getType() === hummus.ePDFObjectArray) {
            // multiple content streams. get all object ids
            var contentsArray = reader.queryDictionaryObject(pageDictionary,'Contents').toPDFArray();
            for(var i = 0; i < annotationsArray.getLength();++i) {
                existingContentsStreamsIds.push(contentsArray.queryObject(i).toPDFIndirectObjectReference().getObjectID());   
            }
        }
    }
    // got existing content streams IDs, let's re-write, adding pre-stream, and post-stream
    modifiedPageDictionary.writeKey('Contents');
    objectsContext.startArray();
    objectsContext.writeIndirectObjectReference(preContent);
    existingContentsStreamsIds.forEach(function(item){
        objectsContext.writeIndirectObjectReference(item)
    });
    objectsContext.writeIndirectObjectReference(postContent);
    objectsContext.endArray();
    objectsContext.endLine();
    
    // 3. write new resources dict with the new resources. this part is a bit annoying with all the various options
    modifiedPageDictionary.writeKey('Resources');
    if(pageDictionary.exists('Resources')) {
        widgetAnnotatons = writeModifiedResourcesDict(handles,  reader.queryDictionaryObject(pageDictionary,'Resources').toPDFDictionary(), widgetAnnotatons);
    }
    else {
        var parentDict = pageDictionary.exists('Parent') ? reader.queryDictionaryObject(pageDictionary,'Parent').toPDFDictionary() : null
        if(!parentDict) {
            widgetAnnotatons = writeNewResourcesDictionary(objectsContext,widgetAnnotatons);
        }
        else {
            var inheritedResources = findInheritedResources(reader,parentDict);
            if(!inheritedResources) {
                widgetAnnotatons = writeNewResourcesDictionary(objectsContext,widgetAnnotatons);
            }
            else {
                widgetAnnotatons = writeModifiedResourcesDict(handles, inheritedResources, widgetAnnotatons);
            }
        }
    }

    objectsContext
        .endDictionary(modifiedPageDictionary)
        .endIndirectObject();    

    // now write the new overlay placing all the widget annoation forms

    // first write stream with just a save, to encapsulate what unwanted graphic state changes
    // the existing content has
    objectsContext.startNewIndirectObject(preContent);
    var preStreamCxt = objectsContext.startPDFStream();
    writeToStreamCxt(preStreamCxt,"q\r\n");
    objectsContext.endPDFStream(preStreamCxt);
    objectsContext.endIndirectObject();

    // now the 2nd one, iterate the widget annotations, write the forms
    objectsContext.startNewIndirectObject(postContent);
    var postStreamCxt = objectsContext.startPDFStream();
    writeToStreamCxt(postStreamCxt,"Q\r\n");

    // iterate widget annotations and write their placement code
    widgetAnnotatons.forEach(function(item){
        writeToStreamCxt(postStreamCxt,"q\r\n");
        writeToStreamCxt(postStreamCxt,"1 0 0 1 " + item.rect[0] + " " + item.rect[1] + " cm\r\n");                
        writeToStreamCxt(postStreamCxt,"/" + item.name + " Do\r\n");
        writeToStreamCxt(postStreamCxt,"Q\r\n");
    });
    objectsContext.endPDFStream(postStreamCxt);
    objectsContext.endIndirectObject();
}

var BUFFER_SIZE = 10000;

function convertWidgetAnnotationsToForm(handles,widgetAnnoations) {
    var reader = handles.reader;
    var objectsContext = handles.objectsContext;
    
    // just make sure that the widget annotation can qualify as a form xobject (just that it has type and subtype...sometimes they don't)
    widgetAnnoations.forEach(function(item){
        var xobjectStream = reader.parseNewObject(item.id).toPDFStream();
        var widgetDictionary = xobjectStream.getDictionary();
        if(!widgetDictionary.exists('Subtype') || !widgetDictionary.exists('Type')) {
            objectsContext.startModifiedIndirectObject(item.id);
            var dict = startModifiedDictionary(handles,widgetDictionary,{'Subtype':-1,'Type':-1, 'Length':-1, 'Filter':-1,'DecodeParams':-1});
            dict.writeKey('Type');
            dict.writeNameValue('XObject');
            dict.writeKey('Subtype');
            dict.writeNameValue('Form');
            var streamCxt = objectsContext.startPDFStream(dict);
            var streamWriteStream = streamCxt.getWriteStream();
            var readStream = reader.startReadingFromStream(xobjectStream);
            while(readStream.notEnded())
            {
              var readData = readStream.read(BUFFER_SIZE);
              streamWriteStream.write(readData);
            }
                
            objectsContext.endPDFStream(streamCxt);
            objectsContext.endIndirectObject();
        }


    });
}

function lockPages(handles) {
    var reader = handles.reader;

    // iterate pages, and lock the fields on them
    for(var i=0;i<reader.getPagesCount();++i) {
        var pageDictionary = reader.parsePageDictionary(i);
        var widgetAnnotatons = collectWidgetAnnotations(reader,pageDictionary)
        convertWidgetAnnotationsToForm(handles,widgetAnnotatons);
        lockWidgetAnnotationsForPage(handles,reader.getPageObjectID(i),pageDictionary,widgetAnnotatons);
    }    
}

function removeForm(handles) {
    // rewrite catalog without the form
    var reader = handles.reader;
    var objectsContext = handles.objectsContext;

    var catalogDict =  reader.queryDictionaryObject(reader.getTrailer(),'Root').toPDFDictionary();
    var catalogObjectId = reader.getTrailer().queryObject('Root').toPDFIndirectObjectReference().getObjectID();
    objectsContext.startModifiedIndirectObject(catalogObjectId);
    modifiedCatalogDictionary = startModifiedDictionary(handles,catalogDict,{'AcroForm':-1});
    objectsContext
        .endDictionary(modifiedCatalogDictionary)
        .endIndirectObject();

    // mark form object for deletion
    var acroformInCatalog = catalogDict.exists('AcroForm') ? catalogDict.queryObject('AcroForm'):null;
    if(!!acroformInCatalog && (acroformInCatalog.getType() === hummus.ePDFObjectIndirectObjectReference)) {
        var acroformObjectId = acroformInCatalog.toPDFIndirectObjectReference().getObjectID();
        objectsContext.deleteObject(acroformObjectId);
    }
    
}
    

function lockForm(writer) {
    var handles = {
        writer : writer,
        reader: writer.getModifiedFileParser(),
        copyingContext : writer.createPDFCopyingContextForModifiedFile(),
        objectsContext: writer.getObjectsContext()
    }

    lockPages(handles);
    removeForm(handles);
}


module.exports = {
    lockForm: lockForm
}