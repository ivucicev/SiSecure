Util
.factory('util', [function () {
  var utils = {
    isValid: function(variable) {
      return !(variable == 'undefined' || typeof variable === 'undefined' || variable === null || variable === '' || variable === false || variable == 'false');
    },
    isNotValid: function(variable) {
      return !this.isValid(variable);
    }
  };
  return utils;
}]);
