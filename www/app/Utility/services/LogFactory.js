Util
.factory('log', function (DEBUG) {
    var log = {
        log: function(data) {
            if (DEBUG) {
                if (typeof data == 'string' || typeof data == 'number') {
                    console.log(data);
                } else if (typeof data == 'object') {
                    console.log(JSON.stringify(data));
                } else if (data == 'undefined' || typeof data == 'undefined') {
                    console.log("Data is not defined");
                } else {
                    console.log("Data is null");
                }
            }
        },
        error: function(data) {
            if (DEBUG) {
                if (typeof data == 'string' || typeof data == 'number') {
                    console.error(data);
                } else if (typeof data == 'object') {
                    console.error(JSON.stringify(data));
                } else if (data == 'undefined' || typeof data == 'undefined') {
                    console.error("Data is not defined");
                } else {
                    console.error("Data is null");
                }
            }
        }
    };
    return log;
});
