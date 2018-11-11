var hummus = require('hummus'),
lockForm = require('./pdf-form-lock').lockForm;

var writer = hummus.createWriterToModify(__dirname + '/sample-forms/OoPdfFormExampleFilled.pdf', {
        modifiedFilePath: __dirname + '/output/OoPdfFormExampleLocked.pdf'
    });


lockForm(writer);
writer.end();