var hummus = require('hummus');
        
var resultPath = './output/pdfWithCommentsResult.pdf';
var sourcePath = './materials/pdfWithComments.pdf';

var pdfWriter = hummus.createWriter(resultPath);

// first, append with regulat method. which should copy without comments
pdfWriter.appendPDFPagesFromPDF(sourcePath);

// second, with the special method. this will copy the pages with the comments
appendPDFPageFromPDFWithAnnotations(pdfWriter,sourcePath);

pdfWriter.end();


function appendPDFPageFromPDFWithAnnotations(pdfWriter,sourcePDFPath) {
    var objCxt = pdfWriter.getObjectsContext();
    var cpyCxt = pdfWriter.createPDFCopyingContext(sourcePDFPath);
    var cpyCxtParser = cpyCxt.getSourceDocumentParser();
    
    // for each page
    for(var i=0;i<cpyCxtParser.getPagesCount();++i) {
        // grab page dictionary
        var pageDictionary = cpyCxtParser.parsePageDictionary(i);
        if(!pageDictionary.exists('Annots')) {
            // no annotation. append as is
            cpyCxt.appendPDFPageFromPDF(i);            
        }
        else {
            // get the annotations array
            var annotationsArray = cpyCxtParser.queryDictionaryObject(pageDictionary,'Annots').toJSArray();
            
            // iterate the array and copy the annotations
            var targetAnnotations = [];
            annotationsArray.forEach(function(annotationRefObject) {
                var annotationID = annotationRefObject.toPDFIndirectObjectReference().getObjectID();
                targetAnnotations.push(cpyCxt.copyObject(annotationID));
            });

            pdfWriter.getEvents().once('OnPageWrite',function(params) {
                // using the page write event, write the new annotations
                params.pageDictionaryContext.writeKey('Annots');
                objCxt.startArray();
                targetAnnotations.forEach(function(objectID) {
                    objCxt.writeIndirectObjectReference(objectID);
                })
                objCxt.endArray(hummus.eTokenSeparatorEndLine);
                
            })          
            // write page. this will trigger the event  
            cpyCxt.appendPDFPageFromPDF(i); 
        }
        
    }
}