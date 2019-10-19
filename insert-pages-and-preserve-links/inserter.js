const fs = require('fs');
const hummus = require('hummus');

function insert(insertPDFPath, mainPDFPath, insertPageNumber, savePath){
    if (!fs.existsSync(insertPDFPath)){
        throw `No file exists at insertPDFPath ${insertPDFPath}.`;
    }
    if (!fs.existsSync(mainPDFPath)){
        throw `No file exists at mainPDFPath ${mainPDFPath}.`;
    }
    
    let insertPage = Number.parseInt(insertPageNumber);
    if (isNaN(insertPage) || insertPage < 1){
        throw `insertPageNumber was ${insertPageNumber}; it must be a positive integer.`;
    }
    
    let mainReader = hummus.createReader(mainPDFPath);
    let insertPDFReader = hummus.createReader(insertPDFPath);
    let insertPDFLength = insertPDFReader.getPagesCount();
    let outputWriter = hummus.createWriter(savePath);
    
    //First pages main.pdf, up to insert point
    appendPDFPageFromPDFWithAnnotations(outputWriter, mainPDFPath, 0, insertPage - 1);

    //insert.pdf
    outputWriter.appendPDFPagesFromPDF(insertPDFPath);
    
    //rest of main.pdf
    appendPDFPageFromPDFWithAnnotations(outputWriter, mainPDFPath, insertPage - 1, mainReader.getPagesCount());

    outputWriter.end();
    console.log(`${insertPDFPath} inserted.`);

    updateLinkDestinations(savePath, insertPDFLength);
    console.log(`Links updated.`);
    console.log(`Saved output to ${savePath}`);
}

//see https://github.com/galkahana/HummusJSSamples/blob/master/appending-pages-with-comments/appendWithComments.js
function appendPDFPageFromPDFWithAnnotations(pdfWriter,sourcePDFPath, startPage, endPage) {
    let cpyCxt = pdfWriter.createPDFCopyingContext(sourcePDFPath);
    let cpyCxtParser = cpyCxt.getSourceDocumentParser();
    
    for (let i=startPage; i < endPage; ++i) {
      let pageDictionary = cpyCxtParser.parsePageDictionary(i);
      if(!pageDictionary.exists('Annots')) {
          cpyCxt.appendPDFPageFromPDF(i);            
      }
      else {
        let reffedObjects;
        pdfWriter.getEvents().once('OnPageWrite',function(params) {
            params.pageDictionaryContext.writeKey('Annots');
            reffedObjects = cpyCxt.copyDirectObjectWithDeepCopy(pageDictionary.queryObject('Annots'))
        })   
        cpyCxt.appendPDFPageFromPDF(i);
        if(reffedObjects && reffedObjects.length > 0)
            cpyCxt.copyNewObjectsForDirectObject(reffedObjects)
      }        
    }
}

function updateLinkDestinations(savePath, insertPDFLength) {
    let writer = hummus.createWriterToModify(savePath);
    let reader = writer.getModifiedFileParser(savePath);
    let copyingContext = writer.createPDFCopyingContextForModifiedFile();
    let pageIDs = getPageIDs(reader);
  
    for (let i = 0; i < reader.getPagesCount(); i++) {
      let pageDictionary = reader.parsePageDictionary(i);
      if (pageDictionary.exists("Annots")) {
        let parsedPageDictionary = reader.parsePageDictionary(i);
        let annots = reader.queryDictionaryObject(parsedPageDictionary, "Annots");
  
        for (let j = 0; j < annots.getLength(); j++) {
          let annotationIndirectReference = annots.queryObject(j);
          let annotation = reader.queryArrayObject(annots, j);
          let annotationObject = annotation.toJSObject();
          let destPDFArray = reader.queryDictionaryObject(annotation, "Dest");
          console.log(destPDFArray);
          let destArrayObject = destPDFArray.toJSArray();
          let oldDestPageID = destArrayObject[0].getObjectID();
          let oldDestPageIndex = getOldPageIDIndexInOldPDF(reader, oldDestPageID);
          let newDestPageID = pageIDs[oldDestPageIndex + insertPDFLength];
  
          let objectContext = writer.getObjectsContext();
          objectContext.startModifiedIndirectObject(
            annotationIndirectReference.getObjectID()
          );
          let modifiedAnnotation = writer.getObjectsContext().startDictionary();
  
          //copy all keys except Dest to the modified annotation
          Object.getOwnPropertyNames(annotationObject).forEach(
            (element, index, array) => {
              if (element != "Dest") {
                modifiedAnnotation.writeKey(element);
                copyingContext.copyDirectObjectAsIs(annotationObject[element]);
              }
            }
          );
  
          //Add the Dest key and make it an array with the first element being the new target page
          modifiedAnnotation.writeKey("Dest");
          objectContext.startArray().writeIndirectObjectReference(newDestPageID);
  
          //copy other elements of the old Dest array
          for (let k = 1; k < destArrayObject.length; k++) {
            copyingContext.copyDirectObjectAsIs(destArrayObject[k]); 
          }
  
          objectContext
            .endArray()
            .endLine()
            .endDictionary(modifiedAnnotation)
            .endIndirectObject();
        }
      }
    }
  
    writer.end();
  }
  
  function getPageIDs(reader){
    let IDs = [];        
    for (let i = 0; i < reader.getPagesCount(); i++){
        IDs.push(reader.getPageObjectID(i));
    }
    return IDs;
  }
  
  function getOldPageIDIndexInOldPDF(reader, oldPageID){
    let oldPageDict = reader.parseNewObject(oldPageID).toPDFDictionary();
    let parent = reader.queryDictionaryObject(oldPageDict, 'Parent').toJSObject();
    let oldPageIDs = parent.Kids.toJSArray().map(e => e.getObjectID());
    return oldPageIDs.indexOf(oldPageID);
  }

module.exports =  { insert };