Login
.controller('LoginController', ['$scope', 'modal', function ($scope, modal) {
    $scope.showSignInModal = function() {
        modal.reveal('app/Login/views/modalSignIn.html');
    };
    $scope.showPasswordRecoveryModal = function() {
        modal.destroy();
        modal.reveal('app/Login/views/modalPasswordRecovery.html');
    };
    $scope.showRegisterModal = function() {
        modal.reveal('app/Login/views/modalRegistration.html');
    };
    $scope.closeModal = function() {
        modal.destroy();
    };
}]);
