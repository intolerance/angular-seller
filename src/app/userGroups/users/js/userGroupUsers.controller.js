angular.module('orderCloud')
    .controller('UserGroupUsersCtrl', UserGroupUsersController)
;

function UserGroupUsersController($exceptionHandler, $filter, $state, $stateParams, toastr, ocUsers, OrderCloud, OrderCloudParameters, UserList, CurrentAssignments, Parameters ) {
    var vm = this;
    vm.list = UserList;
    vm.parameters = Parameters;
    vm.sortSelection = Parameters.sortBy ? (Parameters.sortBy.indexOf('!') == 0 ? Parameters.sortBy.split('!')[1] : Parameters.sortBy) : null;

    //Check if search was used
    vm.searchResults = Parameters.search && Parameters.search.length > 0;

    //Reload the state with new parameters
    vm.filter = function(resetPage) {
        $state.go('userGroup.users', OrderCloudParameters.Create(vm.parameters, resetPage));
    };

    //Reload the state with new search parameter & reset the page
    vm.search = function() {
        $state.go('.', OrderCloudParameters.Create(vm.parameters, true), {notify:false}); //don't trigger $stateChangeStart/Success, this is just so the URL will update with the search
        vm.searchLoading = OrderCloud.Users.List(null, vm.parameters.search, 1, vm.parameters.pageSize, vm.parameters.searchOn, vm.parameters.sortBy, vm.parameters.filters, vm.parameters.buyerid)
            .then(function(data) {
                vm.list = ocUsers.Assignments.Map(CurrentAssignments, data);
                vm.searchResults = vm.parameters.search.length > 0;

                selectedCheck();
            })
    };

    //Clear the search parameter, reload the state & reset the page
    vm.clearSearch = function() {
        vm.parameters.search = null;
        vm.filter(true);
    };

    //Conditionally set, reverse, remove the sortBy parameter & reload the state
    vm.updateSort = function(value) {
        value ? angular.noop() : value = vm.sortSelection;
        switch(vm.parameters.sortBy) {
            case value:
                vm.parameters.sortBy = '!' + value;
                break;
            case '!' + value:
                vm.parameters.sortBy = null;
                break;
            default:
                vm.parameters.sortBy = value;
        }
        vm.filter(false);
    };

    //Reload the state with the incremented page parameter
    vm.pageChanged = function() {
        $state.go('.', {page:vm.list.Meta.Page});
    };

    //Load the next page of results with all of the same parameters
    vm.loadMore = function() {
        return OrderCloud.Users.List(null, Parameters.search, vm.list.Meta.Page + 1, Parameters.pageSize || vm.list.Meta.PageSize, Parameters.searchOn, Parameters.sortBy, Parameters.filters, Parameters.buyerid)
            .then(function(data) {
                vm.list.Items = vm.list.Items.concat(data.Items);
                vm.list.Meta = data.Meta;

                selectedCheck();
            });
    };

    function selectedCheck() {
        vm.allItemsSelected = (_.where(vm.list.Items, {Assigned:true}).length == vm.list.Items.length);
    }

    function changedCheck() {
        vm.changedAssignments = ocUsers.Assignments.Compare(CurrentAssignments, vm.list, $stateParams.usergroupid);
    }

    selectedCheck();

    vm.selectAllItems = function() {
        vm.allItemsSelected = !vm.allItemsSelected;
        _.map(vm.list.Items, function(i) { i.Assigned = vm.allItemsSelected });

        changedCheck();
    };

    vm.selectItem = function(scope) {
        if (!scope.user.Assigned) vm.allItemsSelected = false;
        vm.selectedCount = $filter('filter')(vm.list.Items, {'Assigned':true}).length;

        changedCheck();
    };

    vm.resetAssignments = function() {
        vm.list = ocUsers.Assignments.Map(CurrentAssignments, vm.list);
        vm.changedAssignments = [];

        selectedCheck();
    };

    vm.updateAssignments = function() {
        vm.searchLoading = ocUsers.Assignments.Update(CurrentAssignments, vm.changedAssignments, $stateParams.buyerid)
            .then(function(data) {
                angular.forEach(data.Errors, function(ex) {
                    $exceptionHandler(ex);
                });
                CurrentAssignments = data.UpdatedAssignments;

                changedCheck();
                selectedCheck();
            })
    };

    vm.createUser = function() {
        ocUsers.Create($stateParams.buyerid)
            .then(function(newUser) {
                var newAssignment = {
                    UserID: newUser.ID,
                    UserGroupID: $stateParams.usergroupid
                };

                //Automatically assign the new user to this user group
                vm.searchLoading = OrderCloud.UserGroups.SaveUserAssignment(newAssignment, $stateParams.buyerid)
                    .then(function() {
                        newUser.Assigned = true;
                        CurrentAssignments.push(newAssignment);
                        _updateList(newUser);
                    })
                    .catch(function() {
                        newUser.Assigned = false;
                        _updateList(newUser);
                    });
            });

        function _updateList(n) {
            vm.list.Items.push(n);
            vm.list.Meta.TotalCount++;
            vm.list.Meta.ItemRange[1]++;
            toastr.success(n.Username + ' was created.', 'Success!');
        }
    };

    vm.editUser = function(scope) {
        ocUsers.Edit(scope.user, $stateParams.buyerid)
            .then(function(updatedUser) {
                updatedUser.Assigned = vm.list.Items[scope.$index].Assigned;
                vm.list.Items[scope.$index] = updatedUser;
                if (updatedUser.ID != scope.user.ID) {
                    _.map(CurrentAssignments, function(assignment) {
                        if (assignment.UserID == scope.user.ID) assignment.UserID = updatedUser.ID;
                        return assignment;
                    });

                    changedCheck();
                }
                toastr.success(updatedUser.Username + ' was updated.', 'Success!');
            })
    };

    vm.deleteUser = function(scope) {
        ocUsers.Delete(scope.user, $stateParams.buyerid)
            .then(function() {
                toastr.success(scope.user.Username + ' was deleted.', 'Success!');
                vm.list.Items.splice(scope.$index, 1);
                vm.list.Meta.TotalCount--;
                vm.list.Meta.ItemRange[1]--;

                changedCheck();
            })
    };
}