Conversation
.controller('ConversationController', ['$scope', 'push', 'storage', 'modal', function ($scope, push, storage, modal) {
    $scope.date = new Date();
    $scope.userData = {};
    $scope.init = function (arguments) {
        push.sendPush([String(storage.get("pushToken"))], "123")
        .then(function(res) {
            console.log(res);
        }, function(err) {
            console.log(err);
        });
    };
    $scope.getUserID = function() {
        Ionic.io();

        // this will give you a fresh user or the previously saved 'current user'
        var user = Ionic.User.current();
        console.log("USER ID: ", user.id)
        // if the user doesn't have an id, you'll need to give it one.
        if (!user.id) {
          user.id = Ionic.User.anonymousId();
          console.log(user.id)
          // user.id = 'your-custom-user-id';
        }

        //persist the user
        user.save();
    };
    $scope.registerPush = function (argument) {
        var push = new Ionic.Push({
            "debug": true
        });
        push.register(function(token) {
            console.log("Device token for push: ", token.token);
            storage.save("pushToken", token.token);
        });

    }
    $scope.startNewConversation = function() {
        modal.reveal('app/Conversations/views/_modals/newConversationModal.html');
    };
}]);
