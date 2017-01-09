var hummus = require('hummus'),
	fillForm = require('./pdf-form-fill').fillForm;

    var writer = hummus.createWriterToModify(__dirname + '/sample-forms/OoPdfFormExample.pdf', {
			modifiedFilePath: __dirname + '/output/OoPdfFormExampleFilled.pdf'
		});

    var data = {
        "Given Name Text Box": "Eric",
        "Family Name Text Box": "Jones",
        "House nr Text Box": "someplace",
        "Address 1 Text Box": "somewhere 1",
        "Address 2 Text Box": "somewhere 2",
        "Postcode Text Box": "123456",
        "Country Combo Box": "Spain",
        "Height Formatted Field": "198",
        "Driving License Check Box": true,
        "Favourite Colour List Box": "Brown",
        "Language 1 Check Box": true,
        "Language 2 Check Box": true,
        "Language 3 Check Box": false,
        "Language 4 Check Box": false,
        "Language 5 Check Box": true,
        "Gender List Box": "Man"
    };

    fillForm(writer,data);
    writer.end();
