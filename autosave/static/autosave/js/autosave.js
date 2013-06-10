(function($) {

    window.Autosave = {};

    $(document).on('ready', function(){
        Autosave.setUp(); 
    });

    $(document).on('click', '[href=#ignore-autosaved]', function(e){
        // Clicking this should remove the banner and start autosaving again, replacing
        // the old version.
        var $btn = $(e.target);
        var $note = $btn.closest('p');
        $note.fadeOut('fast');
        window.setInterval(Autosave.save, 5000);
    });

    $(document).on('click', '[href=#revert-to-autosaved]', function(e){
        // Regenerates the form to submit old data, and posts it.
        
        // Handle banner
        var $btn = $(e.target);
        var $banner = $btn.closest('p');
        $banner[0].innerText = "Reverting to your saved version. Be right back...";
        
        // Generate new form data
        var form = $('form');
        form.find('input', 'textarea', '[name]').prop('disabled',true); // Clear the existing form
        var data = JSON.parse(Autosave.retrieve()[0]);
        data.forEach(function(obj){
            var input = $('<input type="hidden" />')[0];
            input.name = obj.name;
            input.value = obj.value;
            $('form').append(input);
        });

        // The CSRF token can change and cause 403's. Always use the current one.
        document.getElementsByName('csrfmiddlewaretoken')[0].value = Autosave.csrf_token;

        function addAutoSaveRetrieveField(){
            // This adds an element to the page that tells Django forms
            // to deliberately fail validation, and return the autosaved contents.
            var input = $('<input type="hidden" />')[0];
            input.name = 'is_retrieved_from_autosave';
            input.value = 1;
            $('form').append(input);
        }
        addAutoSaveRetrieveField();
        form.submit();

    });


    Autosave.setUp = function(){
        Autosave.csrf_token = document.getElementsByName('csrfmiddlewaretoken')[0].value;
        Autosave.timestamp = $.get('last-modified/', function(data){ // Get the last updated value from the server
            var last_updated = parseInt(data.last_updated_epoch, 0) + 15; // An arbitrary margin of error to deal with clock sync
            var last_autosaved = parseInt(Autosave.retrieve()[1], 0);

            // If last_updated is more recent, than this story was probably edited by someone else/another device.
            // If the content is not different, the user probably just closed a window or went to get coffee and close a tab,
            // but had already saved their work.
            if ( last_autosaved > last_updated && Autosave.contentIsDifferent() ) {
                // Suggest revert
                Autosave.suggestRevert(last_autosaved);
            } else {
                // Start Saving Again
                window.setInterval(Autosave.save, 5000);
            }
        });
    };


    Autosave.contentIsDifferent = function(){
        // Determines if the autosaved data is different than the current version.

        var saved = Autosave.retrieve()[0];
        var current = Autosave.captureForm();

        // Clean pagebreak. This is dirty and belongs elsewhere.
        var re_pattern = new RegExp(/<div class="pagebreak">[\s\S]+<\/div>/g);
        var pagebreak_markup = '<div class="pagebreak"></div>';
        saved = saved.replace(re_pattern, pagebreak_markup);
        current = current.replace(re_pattern, pagebreak_markup);

        // Parse and compare each field
        saved = JSON.parse(saved);
        current = JSON.parse(current);
        var ignore_fields = ['csrfmiddlewaretoken'];
        
        // If they're not even the same length, abort.       
        if (saved.length !== current.length){
            return false;
        }
        for (var i = saved.length - 1; i >= 0; i--) {
            if(saved[i].value !== current[i].value && ignore_fields.indexOf(saved[i].name ) === -1 ){
                return true; // The values for non-ignored fields should be identical
            }
        }
        return false;
    };

    function now(){
        // This is slightly ridiculous because javascript's epoch time is
        // in milliseconds by default. We need seconds.
        return Math.round((new Date).getTime()/1000,0);
    }

    Autosave.suggestRevert = function(last_autosaved){
        var form = $('form');
        var msg = [
            "It looks like you have a more recent version autosaved at ",
            Date(last_autosaved).toLocaleString(),
            ". <a href='#revert-to-autosaved'>Revert to that</a> or",
            " <a href='#ignore-autosaved'>continue with this version</a>?"
        ].join('');
        var $alert = $('<p />');
        $alert.addClass('errornote');
        $alert.hide();
        $alert.html(msg);
        form.before($alert);
        $alert.fadeIn();
    };

    Autosave.getFormName = function(){
        // Key names are unique to the page/uri
        return "autosaved_form.data:" + window.location.pathname;
    };
    Autosave.getTimeStampName = function(){
        // Key names are unique to the page/uri
        return "autosaved_form.timestamp:" + window.location.pathname;
    };
    
    Autosave.captureForm = function(){

        var form = $('form');
        var fields = $('form').find('textarea, [name][value]'); // Textareas don't have a value attr, need to be special
        field_list = [];
        var field;
        for (var i = fields.length - 1; i >= 0; i--) {
            field = fields[i];
            field_list.push({ 'name': field.name, 'value': field.value });
        }
        return JSON.stringify(field_list);
    };

    Autosave.save = function(){
        // Cast all the CKEditor instances to their fields
        if (window.CKEDITOR) {
            for (instance in CKEDITOR.instances){
                CKEDITOR.instances[instance].updateElement();
            }
        }
        var data = Autosave.captureForm();
        localStorage.setItem(Autosave.getFormName(), data);
        localStorage.setItem(Autosave.getTimeStampName(), now());
    };

    Autosave.retrieve = function(){
        // Get what's in storage
        var data = localStorage.getItem(Autosave.getFormName());
        var timestamp = localStorage.getItem(Autosave.getTimeStampName());
        return [data, timestamp];
    };

    Autosave.disableWidgets = function(){
        // This has to be done before rewriting the form.
        if (window.CKEDITOR) {
            for (instance in CKEDITOR.instances){
                CKEDITOR.instances[instance].destroy();
            }
        }
    };

    return Autosave;


})(django.jQuery); // Must use Django jQuery because Django-CKEditor modifies it.