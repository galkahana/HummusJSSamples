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
            // this var here will save any reffed objects from the copied annotations object.
            // they will be written after the page copy writing as to not to disturb the
            // page object writing itself.
            var reffedObjects;

            pdfWriter.getEvents().once('OnPageWrite',function(params) {
                // using the page write event, write the new annotations. just copy the object
                // as is, saving any referenced objects for future writes
                params.pageDictionaryContext.writeKey('Annots');
                reffedObjects = cpyCxt.copyDirectObjectWithDeepCopy(pageDictionary.queryObject('Annots'))
            })   

            // write page. this will trigger the event  
            cpyCxt.appendPDFPageFromPDF(i);
            
            // now write the reffed object (should be populated cause onPageWrite was written)
            // note that some or all annotations may be embedded, in which case this array
            // wont hold all annotation objects
            if(reffedObjects && reffedObjects.length > 0)
                cpyCxt.copyNewObjectsForDirectObject(reffedObjects)
        }
        
    }
}