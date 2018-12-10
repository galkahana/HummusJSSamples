var hummus = require('hummus'),
    _ = require('lodash'),
    writeFilledFields = require('./pdf-form-fill-fields').writeFilledFields,
    {readStreamToString, startModifiedDictionary, writeToStreamCxt} = require('./utils');

/**
 * Write a filled form dictionary, and its subordinate fields.
 * assumes in an indirect object, so will finish it.
 * Also takes care of XFA form if one exists.
 */
function writeFilledForm(handles,acroformDict) {
    var modifiedAcroFormDict = startModifiedDictionary(handles,acroformDict,{'Fields':-1});

    var fields = acroformDict.exists('Fields') ? 
                        handles.reader.queryDictionaryObject(acroformDict,'Fields').toPDFArray() :
                        null;
    var xfa = acroformDict.exists('XFA') ? 
                        handles.reader.queryDictionaryObject(acroformDict,'XFA') :
                        null;

    // Deal with fields
    if(fields) {
        modifiedAcroFormDict.writeKey('Fields');
        writeFilledFields(handles,modifiedAcroFormDict,fields,{},''); // will also take care of finishing the dictionary and indirect object, so no need to finish after
    } else {
        handles.objectsContext.endDictionary(modifiedAcroFormDict)
        handles.objectsContext.endIndirectObject();
    }

    // Deal with xfa form. it will be either a stream or array of streams.
    // the code will take care of updating the dataset part of the stream, using
    // parsed form data
    if(xfa) {
        var fs = require('fs')
        var dataSetsObjectStreamId = null
        if(xfa.getType() === hummus.ePDFObjectStream) {
            //var bytes = readStreamToString(handles,xfa)
            
        } else {
            // array
            var xfaJS = xfa.toJSArray()
            for(var i=0; i< xfaJS.length;i+=2) {
                if('datasets' === xfaJS[i].value) {
                    var xfaStream = handles.reader.queryArrayObject(xfa,i+1)
                    var bytes = readStreamToString(handles,xfaStream)
                    fs.writeFile(__dirname + '/output/test.xml', bytes,{encoding:'utf8'},()=>{});
                    dataSetsObjectStreamId = xfaJS[i+1].toPDFIndirectObjectReference().getObjectID()
                }
            } 
        }    
            
        if(dataSetsObjectStreamId) {
            // k. let's do something about it. modify the stream to updated values
            var PDFDigitalForm = require('../parsing-form-values/pdf-digital-form')
            var digitalForm = new PDFDigitalForm(handles.reader);
            fs.writeFile(__dirname + '/output/test.json',JSON.stringify(digitalForm.fields,null,2),{encoding:'utf8'},()=>{});
            fs.writeFile(__dirname + '/output/testShort.json',JSON.stringify(digitalForm.createSimpleKeyValue(),null,2),{encoding:'utf8'},()=>{});

            handles.objectsContext.startModifiedIndirectObject(dataSetsObjectStreamId);
            var dataSetStream = handles.objectsContext.startPDFStream();
            writeToStreamCxt(dataSetStream,"<xfa:datasets xmlns:xfa=\"http://www.xfa.org/schema/xfa-data/1.0/\"\n><xfa:data\n>");
            writeToStreamCxt(dataSetStream,`<form1
            ><Line4_DaytimeTelephoneNumber
            /><Pt1Line1_USCISOnlineAcctNumber
            /><Line3a_StreetNumber
            /><Line3b_AptSteFlrNumber
            /><Line3c_CityOrTown
            /><Line3d_State
            /><Line3e_ZipCode
            /><Line3f_Province
            /><Line3h_Country
            /><Line3g_PostalCode
            /><Pt1ItemNumber7_FaxNumber
            /><Line6_EMail
            /><Line7_MobileTelephoneNumber
            /><Line2b_NameofOrganization
            /><CheckBox2
            /><Checkbox1dAmNot
            /><Checkbox1dAm
            /><Pt2Line1b_BarNumber
            /><CheckBox1
            /><Line3_NameofAttorneyOrRep
            /><CheckBox3
            /><CheckBox4
            /><Line4b_LawStudent
            /><Pt2Line1a_LicensingAuthority
            /><Pt2Line1d_NameofFirmOrOrganization
            /><Line2a_ICE
            /><Line2b_ListMatter
            /><Line3a_CBP
            /><Line3b_ListSpecificMatter
            /><Line1a_USCIS
            /><Line1b_ListFormNumber
            /><Pt3Line7a_NameOfEntity
            /><Line10_MobileTelephoneNumber
            /><Pt3Line8_USCISOnlineAcctNumber
            /><Line12g_PostalCode
            /><Line12f_Province
            /><Line12h_Country
            /><Line12a_StreetNumberName
            /><Line12c_CityOrTown
            /><Line12e_ZipCode
            /><Line12b_AptSteFlrNumber
            /><Line12d_State
            /><Line11_EMail
            /><Pt3Line9_ANumber
            /><Line9_DaytimeTelephoneNumber
            /><Pt3Line7b_TitleofEntity
            /><Pt3Line4_ReceiptNumber
            /><Line1_Signature
            /><Line2_SignatureStudent
            /><Pt5Line2b_DateofSignature
            /><Pt4Line2a_CheckBox2a
            /><Pt4Line2b_CheckBox2b
            /><Pt4Line2c_CheckBox2c
            /><Pt4Line2b_DateofSignature
            /><P5_Line6a_SignatureofApplicant
            /><Pt9Line3d_AdditionalInfo
            /><Pt9Line4d_AdditionalInfo
            /><Pt9Line5d_AdditionalInfo
            /><Pt9Line6d_AdditionalInfo
            /><Pt9Line6d_AdditionalInfo
            /><Pt1Line2c_MiddleName
            /><Pt1Line2b_GivenName
            >Gal</Pt1Line2b_GivenName
            ><Pt1Line2a_FamilyName
            /><Line3b_Unit
            /><Line4_Checkbox
            /><Pt3Line5c_MiddleName
            /><Pt3Line5b_GivenName
            /><Pt3Line5a_FamilyName
            /><Line12b_Unit
            /></form1
            >`)
            

            writeToStreamCxt(dataSetStream,"</xfa:data\n></xfa:datasets\n>");
            handles.objectsContext.endPDFStream(dataSetStream);
        }
    }
}

function fillForm(writer,data, options) {
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

    // parse the acroform dict
    var acroformDict = catalogDict.exists('AcroForm') ? reader.queryDictionaryObject(catalogDict,'AcroForm'):null;

    // lets put all the basics in a nice "handles" package, so we don't have to pass each of them all the time
    var handles = {
        writer:writer,
        reader:reader,
        copyingContext:copyingContext,
        objectsContext:objectsContext,
        data:data,
        acroformDict:acroformDict,
        options:options || {}
    };

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
