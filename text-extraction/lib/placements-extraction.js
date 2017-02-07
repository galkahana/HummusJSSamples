var hummus = require('hummus');
var _ = require('lodash');
var PDFInterpreter = require('./pdf-interpreter');
var MultiDictHelper = require('./multi-dict-helper');

function parseInterestingResources(resourcesDicts,pdfReader,readResources) {
    var forms = {};
    var result = {forms};

    if(!!resourcesDicts) {
        if(resourcesDicts.exists('XObject')) {
            var xobjects = resourcesDicts.queryDictionaryObject('XObject',pdfReader);
            if(!!xobjects) {
                var xobjectsJS = xobjects.toJSObject();
                _.forOwn(xobjectsJS,(xobjectReference,xobjectName)=>{
                    var xobjectObjectId = xobjectReference.toPDFIndirectObjectReference().getObjectID();
                    var xobject = pdfReader.parseNewObject(xobjectObjectId);
                    if(xobject.getType() == hummus.ePDFObjectStream) {
                        var xobjectStream = xobject.toPDFStream();
                        var xobjectDict = xobjectStream.getDictionary();
                        if(xobjectDict.queryObject('Subtype').value == 'Form') {
                            // got a form!
                            forms[xobjectName] = {
                                id:  xobjectObjectId,
                                xobject: xobjectStream,
                                matrix: xobjectDict.exists('Matrix') ? _.map(pdfReader.queryDictionaryObject(xobjectDict,'Matrix').toPDFArray().toJSArray(),item=>item.value):null
                            }
                        }
                    }            
                });
            }
        }

        if(readResources) {
            readResources(resourcesDicts,pdfReader,result);
        }
    }



    return result;
}

function getResourcesDictionary(anObject,pdfReader) {
    return anObject.exists('Resources') ? pdfReader.queryDictionaryObject(anObject,'Resources').toPDFDictionary():null;
}

function getResourcesDictionaries(anObject,pdfReader) {
    // gets an array of resources dictionaries, going up parents. should
    // grab 1 for forms, and 1 or more for pages
    var resourcesDicts = [];
    while(!!anObject) {
        var dict = getResourcesDictionary(anObject,pdfReader);
        if(dict)
            resourcesDicts.push(dict);

        if(anObject.exists('Parent')) {
            var parentDict = pdfReader.queryDictionaryObject(anObject,'Parent');
            if(parentDict.getType() === hummus.ePDFObjectDictionary)
                anObject = parentDict.toPDFDictionary();
            else
                anObject = null;
        }
        else
            anObject = null;
    }
    return new MultiDictHelper(resourcesDicts);
}

function inspectPages(pdfReader,collectPlacements,readResources) {
    var formsUsed = {};
    var pagesPlacements = [];
    // iterate pages, fetch placements, and mark forms for later additional inspection
    for(var i=0;i<pdfReader.getPagesCount();++i) {
        var pageDictionary = pdfReader.parsePageDictionary(i);

        var placements = [];
        pagesPlacements.push(placements);

        var interpreter = new PDFInterpreter();
        interpreter.interpretPageContents(pdfReader,pageDictionary,collectPlacements(
            parseInterestingResources(getResourcesDictionaries(pageDictionary,pdfReader),pdfReader,readResources),
            placements,
            formsUsed
        ));
    }

    return {
        pagesPlacements,
        formsUsed
    };
}

function inspectForms(formsToProcess,pdfReader,formsBacklog,collectPlacements,readResources) {
    if(Object.keys(formsToProcess).length == 0)
        return formsBacklog;
    // add fresh entries to backlog for the sake of registering the forms as discovered,
    // and to provide structs for filling with placement data
    formsBacklog = _.extend(formsBacklog,_.mapValues(formsToProcess,()=>{return []}));
    var formsUsed = {};
    _.forOwn(formsToProcess,(form,formId)=> {
        var interpreter = new PDFInterpreter();
        interpreter.interpretXObjectContents(pdfReader,form,collectPlacements(
            parseInterestingResources(getResourcesDictionaries(form.getDictionary(),pdfReader),pdfReader,readResources),
            formsBacklog[formId],
            formsUsed
        ));
    });

    var newUsedForms = _.pickBy(formsUsed,(form,formId)=> {
        return !formsBacklog[formId];
    });
    // recurse to new forms
    inspectForms(newUsedForms,pdfReader,formsBacklog,collectPlacements,readResources);

    // return final result
    return formsBacklog;
}


function extractPlacements(pdfReader,collectPlacements,readResources) {
    var {pagesPlacements,formsUsed} = inspectPages(pdfReader,collectPlacements,readResources);

    var formsPlacements = inspectForms(formsUsed,pdfReader,null,collectPlacements,readResources);
    return {
        pagesPlacements,
        formsPlacements
    };
}

module.exports = extractPlacements;