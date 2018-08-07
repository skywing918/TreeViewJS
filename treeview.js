(function () {
    var fullTreeItemsList = ko.observableArray();
    (function () {
        function nodeModel(data, config) {
            var self = this;

            self.id = ko.observable();
            self.objectId = ko.observable();
            self.isExpanded = ko.observable(false);
            self.isSelected = ko.observable(false);
            self.isChecked = ko.observable(false);
            self.isCut = ko.observable(false);
            self.hasCheckBox = ko.observable(false);
            self.hasIcon = ko.observable(false);
            self.hasChild = ko.observable(false);
            self.description = ko.observable();
            self.name = ko.observable();
            self.nodes = ko.observableArray();
            self.parentId = ko.observable();
            self.level = ko.observable();

            self.addNode = function (data) {
                var nodesItem = new nodeModel(data, self);
                if(nodesItem.id()=="") {
                  nodesItem.id(fullTreeItemsList().length);
                }
                nodesItem.parentId(self.id());

                self.nodes.push(nodesItem);
                fullTreeItemsList.push(nodesItem);
            }
            self.removeNode = function (id) {
                $.each(self.nodes(), function (index, value) {
                    if (value && value.id && (id == value.id())) {
                        self.nodes.remove(value);
                    }
                    if (self.nodes().length == 0) {
                        self.hasChild(false);
                    }
                });
                return true
            }

            if (config) {
                self.url = config.url;
                self.selectedFunction = config.changed_selected || config.selectedFunction;
            }

            self.toggleVisibility = function () {
                if (self.nodes().length == 0) {
                    self.getChild();
                }
                self.isExpanded(!self.isExpanded());
            };

            self.toggleSelect = function () {
                self.isSelected(!self.isSelected());
            };

            self.isSelected.subscribe(function (changes) {
                if (changes) {
                    if (self.selectedFunction) {
                        self.selectedFunction(self);
                    }
                    $.each(fullTreeItemsList(), function (index, value) {
                        if (value.objectId() != self.objectId()) {
                            value.isSelected(false);
                        }
                    });
                }
            });

            self.isChecked.subscribe(function (changes) {
                $.each(fullTreeItemsList(), function (index, value) {
                    if (value.reportTo && (value.reportTo() == self.objectId())) {
                        value.isChecked(changes);
                    }
                });

            });

            self.toggleCheck = function () {
                self.isChecked(!self.isChecked());
            };

            if (data) {
                ko.mapping.fromJS(data, self.mapOptions, self);
            }
        }

        nodeModel.prototype.mapOptions = {
            nodes: {
                create: function (args) {
                    var nodesItem = new nodeModel(args.data, args.parent)
                    if(nodesItem.id()=="") {
                      nodesItem.id(fullTreeItemsList().length);
                    }
                    fullTreeItemsList.push(nodesItem);
                    return nodesItem;
                }
            }
        };

        nodeModel.prototype.getChild = function () {
            var self = this;
            self.reportToValue = ko.observable(self.objectId());

            getData.call(self);
        };

        function dataTree(configuration) {
            var self = this;
            self.disposable = [];

            self.changed_selected = configuration.changed_selected;

            //fullTreeItemsList.subscribe(function (changes) {
            //    console.log('change event!');
            //}, null, "arrayChange");

            self.checkedItems = ko.observableArray();

            self.serverSide = configuration.serverSide ? true : false;
            self.enableToolbox = configuration.enableToolbox ? true : false;
            self.enableSearchbox = configuration.enableSearchbox ? true : false;
            self.isProcessing = ko.observable(false);
            self.url = configuration.url;
            self.deferRender = getDefaultValue(true, configuration.deferRender);
            self.error = ko.observable('');

            self.searchValue = ko.observable('');
            //Is ajax source only
            self.isAjaxSource = self.url && !self.serverSide;
            if (!self.serverSide) self.searchField = configuration.searchField;

            //items/data in tree
            var nodesItem = new nodeModel(configuration.data, self)
            self.data = ko.observable(nodesItem) || ko.observable();
            fullTreeItemsList.push(nodesItem);

            self.filteredItems = ko.pureComputed(function () {
                if (self.serverSide) {
                    return ko.unwrap(self.data);
                } else {
                    var filter = self.searchValue().toLowerCase();
                    if (!filter) return ko.unwrap(self.data);
                    if (!self.searchField) throw new error('To use search for client side processing, searchField option must defined.');
                    return ko.utils.arrayFilter(ko.unwrap(self.data), function (item) {
                        return ko.utils.stringStartsWith(ko.unwrap(item[self.searchField]).toLowerCase(), filter);
                    });
                }
            }, self);

            // toolbox
            self.cut = function () {
                var checkedItems = self.get_checked();
                if (checkedItems.length > 0) {
                    $.each(checkedItems, function (index, value) {
                        value.isCut(true);
                    });
                    self.uncheck_all();
                }
            }

            self.paste = function () {
                var bufferItems = self.get_buffer();
                if (bufferItems.length == 0) {
                    return;
                }

                var selectedItem = self.get_selected();
                if (selectedItem.length == 0) {
                    return;
                }

                //TODO: add rule for paste

                //var status = postData.call(self);
                ko.utils.arrayForEach(bufferItems, function (item) {
                    var unmapped = ko.mapping.toJS(item);
                    unmapped.parentId = selectedItem[0].id();
                    unmapped.reportTo = selectedItem[0].objectId();
                    selectedItem[0].addNode(unmapped);
                });

                var parentNode = self.get_node(bufferItems[0].parentId());

                ko.utils.arrayForEach(bufferItems, function (item) {
                    parentNode.removeNode(item.id());
                });
                
                // clean tag
                self.clear_buffer();
            }
        }

        dataTree.prototype.search = function (searchValue) {
            var self = this;
            if (searchValue)
                self.searchValue(searchValue);
            if (self.serverSide || self.isAjaxSource)
                getData.call(self);
        };

        function getData() {
            var self = this;

            //self.isProcessing(true);
            return $.ajax(self.url, { data: buildQuery.call(self) }).then(function (r) {
                if (self instanceof nodeModel) {
                    $.each(r, function (index, value) {
                        self.addNode(value, self);
                    });
                } else {
                    var root = new nodeModel(null, self);
                    root.url = self.url;
                    $.each(r, function (index, value) {
                        root.addNode(value, self);
                    });
                    self.data(root);
                }
            }, function (xhr, errorText, statusText) {
                if (xhr.status === 500 && xhr.responseText.indexOf('friendlyMessage') !== -1) {
                    //self.clear();
                    var error = JSON.parse(xhr.responseText);
                    //self.error(error.friendlyMessage);
                    xhr.showError = false;
                    console.log(error);
                } else {
                    //self.error(statusText);
                }
            }).always(function () {
                //self.isProcessing(false);
            });
        }

        function buildQuery() {
            var self = this;

            var param = $.extend({
                reportTo: ko.unwrap(self.reportToValue),
                search: { value: ko.unwrap(self.searchValue) },
            }, self.additionalParam);
            return param;
        }

        function getDefaultValue(defaultValue, valueIf) {
            return valueIf === false
                ? false
                : valueIf ? valueIf : defaultValue;
        }

        function postData() {
            var self = this;
            return $.ajax({
                type: 'POST',
                url: "someaction.do?action=saveData",
                data: "",
                dataType: "text",
                success: function (resultData) {
                    alert("Save Complete")
                }
            });
        }

        dataTree.prototype.get_checked = function () {
            var self = this;
            var tmp = ko.utils.arrayFilter(fullTreeItemsList(), function (item) {
                return item.isChecked();
            });
            return tmp;
        }

        dataTree.prototype.uncheck_all = function () {
            var self = this;
            var tmp = self.get_checked();
            $.each(tmp, function (index, value) {
                value.isChecked(false);
            });
        }

        dataTree.prototype.get_buffer = function () {
            var self = this;
            var tmp = ko.utils.arrayFilter(fullTreeItemsList(), function (item) {
                return item.isCut();
            });
            return tmp;
        }

        dataTree.prototype.clear_buffer = function () {
            var self = this;
            var temp = self.get_buffer();
            $.each(temp, function (index, value) {
                value.isCut(false);
            });
        }

        dataTree.prototype.get_selected = function () {
            var self = this;
            var tmp = ko.utils.arrayFilter(fullTreeItemsList(), function (item) {
                return item.isSelected();
            });
            return tmp;
        }

        dataTree.prototype.get_node = function (obj) {
            if (obj && obj.id) {
                obj = obj.id;
            }
            var dom;
            try {
                var tmp = ko.utils.arrayFilter(fullTreeItemsList(), function (item) {
                    return item.id() == obj;
                });
                return tmp[0];
            } catch (ex) { return false; }
        }

        ko.treeView = {
            viewModel: dataTree
        }
    })();

    var templateEngine = new ko.nativeTemplateEngine();

    templateEngine.addTemplate = function (templateName, templateMarkup) {
        document.write("<script type='text/html' id='" + templateName + "'>" + templateMarkup + '<' + '/script>');
    };

    templateEngine.addTemplate("ko_treeView_toolbox", "\
                    <div id=\"toolsbar\" style=\"padding:15px; padding-top:0px; padding-bottom:0px\">\
                        <button class=\"btn btn-default\" type=\"button\" id=\"cut\" value=\"cut\" data-bind=\"click: cut\">\
                            <span class=\"glyphicon glyphicon-copy\" aria-hidden=\"true\"></span>cut\
                        </button>\
                        <button class=\"btn btn-default\" type=\"button\" id=\"paste\" value=\"paste\" data-bind=\"click: paste\">\
                            <span class=\"glyphicon glyphicon-paste\" aria-hidden=\"true\"></span>paste\
                        </button>\
                     </div>");

    templateEngine.addTemplate("ko_treeView_searchbox", "\
                    <form class=\"navbar-form form-group\">\
                        <div class=\"input-group\">\
                            <input style=\"width:140px\" id=\"inputUserSearch\" type=\"text\" class=\"form-control\" data-bind=\"value:searchValue\">\
                            <span class=\"input-group-btn\">\
                                <button id=\"btnUserSearch\" class=\"btn btn-default\" type=\"button\" data-bind=\"click:search.bind($data,searchValue())\">\
                                    <span class=\"glyphicon glyphicon-search\"></span>\
                                </button>\
                            </span>\
                       </div>\
                     </form>");

    ko.bindingHandlers.treeView = {
        createNodes: function (rootElement, options) {
            //apply first binding
            ko.applyBindingsToNode(rootElement, { template: { name: "tree-template" } }, options);
        },
        init: function (element, viewModelAccessor, allBindings, viewModel, bindingContext) {
            var vmAccessor = viewModelAccessor();

            var treetemplate = '<script type="text/html" id="tree-template"><ul class="jstree-children jstree-wholerow-ul jstree-no-dots" data-bind="foreach: nodes"><li class="jstree-node" data-bind="attr:{id:id, parentId:parentId}, template: { name: \'node-name-template\' , data: $data}, css:{\'jstree-open\' : isExpanded() && nodes().length>0, \'jstree-close\': !isExpanded() && hasChild()}"></li></ul></script>';
            var foldertemplate = '<script type="text/html" id="folder-template"><ul class="jstree-children" data-bind="visible: isExpanded, foreach: $data.nodes"><li class="jstree-node" data-bind="attr:{id:id, parentId:parentId}, template: { name: \'node-name-template\' , data: $data}, css:{\'jstree-open\' : isExpanded() && nodes().length>0, \'jstree-close\': !isExpanded() && hasChild(), \'jstree-leaf\':!hasChild()}"></li></ul></script>';
            var nodenametemplate = '<script type="text/html" id="node-name-template"><div class="jstree-wholerow" data-bind="css:{\'jstree-wholerow-clicked\':isSelected}, click:toggleSelect">&nbsp;</div><i class="jstree-icon jstree-ocl" data-bind="click: toggleVisibility"></i><a class="jstree-anchor" href="#" data-bind="css: { \'pointer-icon\' : nodes().length>0,\'jstree-checked\':isChecked}"><i class="jstree-icon jstree-checkbox" data-bind="visible: hasCheckBox, click:toggleCheck"></i><i class="jstree-icon jstree-themeicon jstree-themeicon-custom" data-bind="css:icon, visible: hasIcon"></i><span data-bind="text: name, attr: { \'title\' : description }, tooltip: { delay: { show: 500, hide: 10 } }, click:toggleSelect"></span></a> <!-- ko if: nodes().length !== 0 --> <div data-bind="template: { name: \'folder-template\' ,data: $data}"></div> <!-- /ko --> </script>';

            //append templates
            document.body.insertAdjacentHTML('beforeend', treetemplate);
            document.body.insertAdjacentHTML('beforeend', foldertemplate);
            document.body.insertAdjacentHTML('beforeend', nodenametemplate);

            //request initial data
            if (((vmAccessor.url && !vmAccessor.serverSide) || (vmAccessor.serverSide)) && vmAccessor.deferRender) {
                vmAccessor.search();
            }

            //let this handler control its descendants. 
            return { controlsDescendantBindings: true };
        },
        update: function (element, viewModelAccessor, allBindings) {
            var viewModel = viewModelAccessor();

            // Empty the element
            while (element.firstChild) {
                ko.removeNode(element.firstChild);
            }

            // Allow the default templates to be overridden
            var toolboxTemplateName = allBindings.get('treeViewToolboxTemplate') || "ko_treeView_toolbox",
                searchboxTemplateName = allBindings.get('treeViewSearchboxTemplate') || "ko_treeView_searchbox";

            // Render the tool box
            if (viewModel.enableToolbox) {
                var toolboxContainer = element.appendChild(document.createElement("DIV"));
                ko.renderTemplate(toolboxTemplateName, viewModel, { templateEngine: templateEngine }, toolboxContainer, "replaceNode");
            }

            // Render the search box
            if (viewModel.enableSearchbox) {
                var searchboxContainer = element.appendChild(document.createElement("DIV"));
                ko.renderTemplate(searchboxTemplateName, viewModel, { templateEngine: templateEngine }, searchboxContainer, "replaceNode");
            }

            // Render the search box
            var treeviewContainer = element.appendChild(document.createElement("DIV"));
            treeviewContainer.style.height = "215px";
            treeviewContainer.style.overflow = "auto";

            var treeContainer = treeviewContainer.appendChild(document.createElement("DIV"));
            treeContainer.className = "jstree-default";

            //key
            $(treeContainer).keydown(function (e) {
                switch (e.which) {
                    case 13: // enter
                        e.type = "click";
                        $(e.target.parentElement.firstElementChild).trigger(e);
                        break;
                    case 32: // space
                        e.type = "click";
                        $(e.target).children('.jstree-checkbox').trigger(e);
                        break;
                    case 37: // left
                        e.type = "click";
                        $(e.target.parentElement).children('.jstree-ocl').trigger(e);
                        break;
                    case 39: // right
                        e.type = "click";
                        $(e.target.parentElement).children('.jstree-ocl').trigger(e);
                        break;
                    default:
                        break;
                }

            });

            //create the tree
            ko.bindingHandlers.treeView.createNodes(treeContainer, viewModel.data);
            viewModel.data.subscribe(function () {
                ko.bindingHandlers.treeView.createNodes(treeContainer, viewModel.data);
            });
        }
    };
})();