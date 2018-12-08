var hummus = require('hummus'),
    fillForm = require('./pdf-form-fill').fillForm;

    var writer = hummus.createWriterToModify(__dirname + '/sample-forms/g-28.pdf', {
            modifiedFilePath: __dirname + '/output/g-28-filled.pdf',
            log: __dirname + '/output/g-28-filled.log'
		});

    var data = {
        "form1[0].#subform[0].Pt1Line2b_GivenName[0]":"Gal"
    };

    fillForm(writer,data, {
        defaultTextOptions: {
            font: writer.getFontForFile(__dirname + '/sample-forms/courierb.ttf'),
            size: 10,
            colorspace: 'gray',
            color: 0,
        },
        debug:false
    });
    writer.end();
