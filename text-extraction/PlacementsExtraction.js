var hummus = require('hummus');
var PDFInterpreter = require('./PDFInterpreter');
var _ = require('lodash');

function parseInterestingResources(resources,pdfReader) {
    var forms = {};
    resources = resources.toPDFDictionary();

    if(!!resources && resources.exists('XObject')) {
        var xobjects = pdfReader.queryDictionaryObject(resources.toPDFDictionary(),'XObject');
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
                            xobject: xobjectStream
                        }
                    }
                }            
            });
        }
    }

    return {
        forms
    };
}

function getResourcesDictionary(anObject,pdfReader) {
    return anObject.exists('Resources') ? pdfReader.queryDictionaryObject(anObject,'Resources'):null;
}

function inspectPages(pdfReader,collectPlacements) {
    var formsUsed = {};
    var pagesPlacements = [];
    // iterate pages, fetch placements, and mark forms for later additional inspection
    for(var i=0;i<pdfReader.getPagesCount();++i) {
        var pageDictionary = pdfReader.parsePageDictionary(i);

        var placements = [];
        pagesPlacements.push(placements);

        var interpreter = new PDFInterpreter();
        interpreter.interpretPageContents(pdfReader,pageDictionary,collectPlacements(
            parseInterestingResources(getResourcesDictionary(pageDictionary,pdfReader),pdfReader),
            placements,
            formsUsed
        ));
    }

    return {
        pagesPlacements,
        formsUsed
    };
}

function inspectForms(formsToProcess,pdfReader,formsBacklog,collectPlacements) {
    if(Object.keys(formsToProcess).length == 0)
        return formsBacklog;
    // add fresh entries to backlog for the sake of registering the forms as discovered,
    // and to provide structs for filling with placement data
    formsBacklog = _.extend(formsBacklog,_.mapValues(formsToProcess,()=>{return []}));
    var formsUsed = {};
    _.forOwn(formsToProcess,(form,formId)=> {
        var interpreter = new PDFInterpreter();
        interpreter.interpretXObjectContents(pdfReader,form,collectPlacements(
            parseInterestingResources(getResourcesDictionary(form.getDictionary(),pdfReader),pdfReader),
            formsBacklog[formId],
            formsUsed
        ));
    });

    var newUsedForms = _.filter(formsUsed,(form,formId)=> {
        return !formsBacklog[formId];
    });
    // recurse to new forms
    inspectForms(newUsedForms,pdfReader,formsBacklog,collectPlacements);

    // return final result
    return formsBacklog;
}


function extractPlacements(pdfReader,collectPlacements) {
    var {pagesPlacements,formsUsed} = inspectPages(pdfReader,collectPlacements);

    var formsPlacements = inspectForms(formsUsed,pdfReader,null,collectPlacements);

    return {
        pagesPlacements,
        formsPlacements
    };
}

module.exports = extractPlacements;