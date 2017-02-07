Conversation
.config(function($stateProvider, $urlRouterProvider) {
    $stateProvider
    .state('tab.conversations', {
        url: '/conversations',
        views: {
            'tab-conversations': {
                templateUrl: 'app/conversations/views/tab-conversation.html',
                controller: 'ConversationController'
            }
        }
    })
    $urlRouterProvider.otherwise('/tab/conversations');
});
