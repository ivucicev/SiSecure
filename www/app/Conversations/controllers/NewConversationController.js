Conversation.controller('NewConversationController', ['$scope', 'storage', 'modal', '$cordovaBarcodeScanner', function ($scope, storage, modal, $cordovaBarcodeScanner) {
    $scope.generateData = function(arguments) {
        $scope.json = {id: String(storage.get("pushToken")),u:'IvanVucicevic123',s: [{
            s: 0,
            l: 1
        }]};
        $scope.userData = JSON.stringify($scope.json);
    }
    $scope.closeModal = function() {
        modal.destroy()
    }
    $scope.scanQRcode = function() {
        $cordovaBarcodeScanner
        .scan()
        .then(function(barcodeData) {
            // Success! Barcode data is here
            console.log(barcodeData);
            alert(barcodeData.text);
        }, function(error) {
            // An error occurred
        });
    }
}]);
