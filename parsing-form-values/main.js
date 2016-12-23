var hummus = require('hummus'),
	PDFDigitalForm = require('./pdf-digital-form'),
	fs = require('fs'),
	path = require('path');


	fs.readdir(__dirname + '/sample-forms',function(err,files) {
		files.forEach(function(file) {
			if(path.extname(file).toLowerCase() == '.pdf') {
				var noExt = path.basename(file,path.extname(file));
				pdfParser = hummus.createReader(__dirname + '/sample-forms/' + file),
				digitalForm = new PDFDigitalForm(pdfParser);
				if(digitalForm.hasForm()) {
					fs.writeFile(__dirname + '/outputs/' + noExt + '.json',JSON.stringify(digitalForm.fields,null,2),{encoding:'utf8'},()=>{});
					fs.writeFile(__dirname + '/outputs/' + noExt + '-short.json',JSON.stringify(digitalForm.createSimpleKeyValue(),null,2),{encoding:'utf8'},()=>{});
				}
			}
		});
	});



