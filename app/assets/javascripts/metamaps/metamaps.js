var labelType, useGradients, nativeTextSupport, animate;

(function () {
    var ua = navigator.userAgent,
        iStuff = ua.match(/iPhone/i) || ua.match(/iPad/i),
        typeOfCanvas = typeof HTMLCanvasElement,
        nativeCanvasSupport = (typeOfCanvas == 'object' || typeOfCanvas == 'function'),
        textSupport = nativeCanvasSupport && (typeof document.createElement('canvas').getContext('2d').fillText == 'function');
    //I'm setting this based on the fact that ExCanvas provides text support for IE
    //and that as of today iPhone/iPad current text support is lame
    labelType = (!nativeCanvasSupport || (textSupport && !iStuff)) ? 'Native' : 'HTML';
    nativeTextSupport = labelType == 'Native';
    useGradients = nativeCanvasSupport;
    animate = !(iStuff || !nativeCanvasSupport);
})();

// TODO eliminate these 4 global variables
var panningInt; // this variable is used to store a 'setInterval' for the Metamaps.JIT.SmoothPanning() function, so that it can be cleared with window.clearInterval
var tempNode = null,
    tempInit = false,
    tempNode2 = null;

Metamaps.Settings = {
    embed: false, // indicates that the app is on a page that is optimized for embedding in iFrames on other web pages
    sandbox: false, // puts the app into a mode (when true) where it only creates data locally, and isn't writing it to the database
    colors: {
        background: '#344A58',
        synapses: {
            normal: '#222222',
            hover: '#222222',
            selected: '#FFFFFF'
        },
        topics: {
            selected: '#FFFFFF'
        },
        labels: {
            background: '#18202E',
            text: '#DDD'
        }
    }
};

Metamaps.Touch = {
    touchPos: null, // this stores the x and y values of a current touch event 
    touchDragNode: null // this stores a reference to a JIT node that is being dragged
};

Metamaps.Mouse = {
    didPan: false,
    changeInX: 0,
    changeInY: 0,
    edgeHoveringOver: false,
    boxStartCoordinates: false,
    boxEndCoordinates: false,
    synapseStartCoordinates: [],
    synapseEndCoordinates: null,
    lastNodeClick: 0,
    lastCanvasClick: 0,
    DOUBLE_CLICK_TOLERANCE: 300
};

Metamaps.Selected = {
    Nodes: [],
    Edges: []
};

Metamaps.Metacodes = {}; // will be initialized in Metamaps.Backbone.init as a MetacodeCollection
Metamaps.Topics = {}; // will be initialized in Metamaps.Backbone.init as a TopicCollection
Metamaps.Synapses = {}; // will be initialized in Metamaps.Backbone.init as a SynapseCollection
Metamaps.Mappings = {}; // will be initialized in Metamaps.Backbone.init as a MappingCollection


/*
 *
 *   BACKBONE
 *
 */
Metamaps.Backbone.init = function () {
    var self = Metamaps.Backbone;

    self.Metacode = Backbone.Model.extend({
        initialize: function () {
            var image = new Image();
            image.src = this.get('icon');
            this.set('image',image);
        }
    });
    self.MetacodeCollection = Backbone.Collection.extend({
        model: this.Metacode,
        url: '/metacodes',
    });

    self.Topic = Backbone.Model.extend({
        urlRoot: '/topics',
        blacklist: ['node', 'created_at', 'updated_at'],
        toJSON: function (options) {
            return _.omit(this.attributes, this.blacklist);
        },
        initialize: function () {
            if (this.isNew()) {
                this.set({
                    "user_id": Metamaps.Active.Mapper.id,
                    "desc": '',
                    "link": '',
                    "permission": Metamaps.Active.Map ? Metamaps.Active.Map.get('permission') : 'commons'
                });
            }
        },
        authorizeToEdit: function (mapper) {
            if (mapper && (this.get('permission') === "commons" || this.get('user_id') === mapper.get('id'))) return true;
            else return false;
        },
        authorizePermissionChange: function (mapper) {
            if (mapper && this.get('user_id') === mapper.get('id')) return true;
            else return false;
        },
        getDate: function () {

        },
        getUser: function () {
            return Metamaps.Mapper.get(this.get('user_id'));
        },
        getMetacode: function () {
            return Metamaps.Metacodes.get(this.get('metacode_id'));
        },
        getMapping: function () {
            
            if (!Metamaps.Active.Map) return false;
            
            return Metamaps.Mappings.findWhere({
                map_id: Metamaps.Active.Map.id,
                topic_id: this.isNew() ? this.cid : this.id
            });
        },
        createNode: function () {
            var mapping;
            var node = {
                adjacencies: [],
                id: this.isNew() ? this.cid : this.id,
                name: this.get('name')
            };
            
            if (Metamaps.Active.Map) {
                mapping = this.getMapping();
                node.data = {
                    $mapping: null,
                    $mappingID: mapping.id
                };
            }
            
            return node;
        },
        updateNode: function () {
            var mapping;
            var node = this.get('node');
            node.setData('topic', this);
            node.id = this.isNew() ? this.cid : this.id;
            
            if (Metamaps.Active.Map) {
                mapping = this.getMapping();
                node.setData('mapping', mapping);
            }
            
            return node;
        },
    });

    self.TopicCollection = Backbone.Collection.extend({
        model: self.Topic,
        url: '/topics',
        comparator: function (a, b) {
            a = a.get('name').toLowerCase();
            b = b.get('name').toLowerCase();
            return a > b ? 1 : a < b ? -1 : 0;
        }
    });

    self.Synapse = Backbone.Model.extend({
        urlRoot: '/synapses',
        blacklist: ['edge', 'created_at', 'updated_at'],
        toJSON: function (options) {
            return _.omit(this.attributes, this.blacklist);
        },
        initialize: function () {
            if (this.isNew()) {
                this.set({
                    "user_id": Metamaps.Active.Mapper.id,
                    "permission": Metamaps.Active.Map ? Metamaps.Active.Map.get('permission') : 'commons',
                    "category": "from-to"
                });
            }
        },
        authorizeToEdit: function (mapper) {
            if (mapper && (this.get('permission') === "commons" || this.get('user_id') === mapper.get('id'))) return true;
            else return false;
        },
        authorizePermissionChange: function (mapper) {
            if (mapper && this.get('user_id') === mapper.get('id')) return true;
            else return false;
        },
        getUser: function () {
            return Metamaps.Mapper.get(this.get('user_id'));
        },
        getTopic1: function () {
            return Metamaps.Topic.get(this.get('node1_id'));
        },
        getTopic2: function () {
            return Metamaps.Topic.get(this.get('node2_id'));
        },
        getDirection: function () {
            return [
                    this.get('node1_id'),
                    this.get('node2_id')
                ];
        },
        getMapping: function () {
            
            if (!Metamaps.Active.Map) return false;
            
            return Metamaps.Mappings.findWhere({
                map_id: Metamaps.Active.Map.id,
                synapse_id: this.isNew() ? this.cid : this.id
            });
        },
        createEdge: function () {
            var mapping, mappingID;
            var synapseID = this.isNew() ? this.cid : this.id;

            var edge = {
                nodeFrom: this.get('node1_id'),
                nodeTo: this.get('node2_id'),
                data: {
                    $synapses: [],
                    $synapseIDs: [synapseID],
                }
            };
            
            if (Metamaps.Active.Map) {
                mapping = this.getMapping();
                mappingID = mapping.isNew() ? mapping.cid : mapping.id;
                edge.data.$mappings = [];
                edge.data.$mappingIDs = [mappingID];
            }
            
            return edge;
        },
        updateEdge: function () {
            var mapping;
            var edge = this.get('edge');
            edge.getData('synapses').push(this);
            
            if (Metamaps.Active.Map) {
                mapping = this.getMapping();
                edge.getData('mappings').push(mapping);
            }
            
            return edge;
        },
    });

    self.SynapseCollection = Backbone.Collection.extend({
        model: self.Synapse,
        url: '/synapses'
    });

    self.Mapping = Backbone.Model.extend({
        urlRoot: '/mappings',
        blacklist: ['created_at', 'updated_at'],
        toJSON: function (options) {
            return _.omit(this.attributes, this.blacklist);
        },
        initialize: function () {
            if (this.isNew()) {
                this.set({
                    "user_id": Metamaps.Active.Mapper.id,
                    "map_id": Metamaps.Active.Map ? Metamaps.Active.Map.id : null
                });
            }
        },
        getUser: function () {
            return Metamaps.Mapper.get(this.get('user_id'));
        },
        getMap: function () {
            return Metamaps.Map.get(this.get('map_id'));
        },
        getTopic: function () {
            if (this.get('category') === 'Topic') return Metamaps.Topic.get(this.get('topic_id'));
            else return false;
        },
        getSynapse: function () {
            if (this.get('category') === 'Synapse') return Metamaps.Synapse.get(this.get('synapse_id'));
            else return false;
        }
    });

    self.MappingCollection = Backbone.Collection.extend({
        model: self.Mapping,
        url: '/mappings'
    });

    Metamaps.Metacodes = new self.MetacodeCollection(Metamaps.Metacodes);

    Metamaps.Topics = new self.TopicCollection(Metamaps.Topics);

    Metamaps.Synapses = new self.SynapseCollection(Metamaps.Synapses);

    Metamaps.Mappings = new self.MappingCollection(Metamaps.Mappings);

    if (Metamaps.Active.Map) {
        Metamaps.Active.Map = new self.Map(Metamaps.Active.Map);
        Metamaps.Maps.add(Metamaps.Active.Map);
    }
    
    if (Metamaps.Active.Topic) Metamaps.Active.Topic = new self.Topic(Metamaps.Active.Topic);
}; // end Metamaps.Backbone.init


/*
 *
 *   CREATE
 *
 */
Metamaps.Create = {
    isSwitchingSet: false, // indicates whether the metacode set switch lightbox is open
    metacodeScrollerInit: false, // indicates whether the scrollbar in the custom metacode set space has been init
    selectedMetacodeSet: null,
    selectedMetacodeSetIndex: null,
    selectedMetacodeNames: [],
    newSelectedMetacodeNames: [],
    selectedMetacodes: [],
    newSelectedMetacodes: [],
    init: function () {
        var self = Metamaps.Create;
        self.newTopic.init();
        self.newSynapse.init();

        //////
        //////
        //// SWITCHING METACODE SETS

        $('#metacodeSwitchTabs').tabs({
            selected: self.selectedMetacodeSetIndex
        }).addClass("ui-tabs-vertical ui-helper-clearfix");
        $("#metacodeSwitchTabs .ui-tabs-nav li").removeClass("ui-corner-top").addClass("ui-corner-left");
        $('.customMetacodeList li').click(self.toggleMetacodeSelected); // within the custom metacode set tab
    },
    toggleMetacodeSelected: function () {
        var self = Metamaps.Create;

        if ($(this).attr('class') != 'toggledOff') {
            $(this).addClass('toggledOff');
            var value_to_remove = $(this).attr('id');
            var name_to_remove = $(this).attr('data-name');
            self.newSelectedMetacodes.splice(self.newSelectedMetacodes.indexOf(value_to_remove), 1);
            self.newSelectedMetacodeNames.splice(self.newSelectedMetacodeNames.indexOf(name_to_remove), 1);
        } else if ($(this).attr('class') == 'toggledOff') {
            $(this).removeClass('toggledOff');
            self.newSelectedMetacodes.push($(this).attr('id'));
            self.newSelectedMetacodeNames.push($(this).attr('data-name'));
        }
    },
    updateMetacodeSet: function (set, index, custom) {

        if (custom && Metamaps.Create.newSelectedMetacodes.length == 0) {
            alert('Please select at least one metacode to use!');
            return false;
        }

        var codesToSwitchTo;
        Metamaps.Create.selectedMetacodeSetIndex = index;
        Metamaps.Create.selectedMetacodeSet = "metacodeset-" + set;

        if (!custom) {
            codesToSwitchTo = $('#metacodeSwitchTabs' + set).attr('data-metacodes').split(',');
            $('.customMetacodeList li').addClass('toggledOff');
            Metamaps.Create.selectedMetacodes = [];
            Metamaps.Create.selectedMetacodeNames = [];
            Metamaps.Create.newSelectedMetacodes = [];
            Metamaps.Create.newSelectedMetacodeNames = [];
        }
        if (custom) {
            // uses .slice to avoid setting the two arrays to the same actual array
            Metamaps.Create.selectedMetacodes = Metamaps.Create.newSelectedMetacodes.slice(0);
            Metamaps.Create.selectedMetacodeNames = Metamaps.Create.newSelectedMetacodeNames.slice(0);
            codesToSwitchTo = Metamaps.Create.selectedMetacodeNames.slice(0);
        }

        // sort by name
        codesToSwitchTo.sort();
        codesToSwitchTo.reverse();

        $('#metacodeImg, #metacodeImgTitle').empty();
        $('#metacodeImg').removeData('cloudcarousel');
        var newMetacodes = "";
        var metacode;
        for (var i = 0; i < codesToSwitchTo.length; i++) {
            metacode = Metamaps.Metacodes.findWhere({ name: codesToSwitchTo[i] });
            newMetacodes += '<img class="cloudcarousel" width="40" height="40" src="' + metacode.get('icon') + '" title="' + metacode.get('name') + '" alt="' + metacode.get('name') + '"/>';
        };
        $('#metacodeImg').empty().append(newMetacodes).CloudCarousel({
            titleBox: $('#metacodeImgTitle'),
            yRadius: 40,
            xPos: 150,
            yPos: 40,
            speed: 0.3,
            mouseWheel: true,
            bringToFront: true
        });

        Metamaps.GlobalUI.closeLightbox();
        $('#topic_name').focus();

        var mdata = {
            "metacodes": {
                "value": custom ? Metamaps.Create.selectedMetacodes.toString() : Metamaps.Create.selectedMetacodeSet
            }
        };
        $.ajax({
            type: "POST",
            dataType: 'json',
            url: "/user/updatemetacodes",
            data: mdata,
            success: function (data) {
                console.log('selected metacodes saved');
            },
            error: function () {
                console.log('failed to save selected metacodes');
            }
        });
    },

    cancelMetacodeSetSwitch: function () {
        var self = Metamaps.Create;
        self.isSwitchingSet = false;

        if (self.selectedMetacodeSet != "metacodeset-custom") {
            $('.customMetacodeList li').addClass('toggledOff');
            self.selectedMetacodes = [];
            self.selectedMetacodeNames = [];
            self.newSelectedMetacodes = [];
            self.newSelectedMetacodeNames = [];
        } else { // custom set is selected
            // reset it to the current actual selection
            $('.customMetacodeList li').addClass('toggledOff');
            for (var i = 0; i < self.selectedMetacodes.length; i++) {
                $('#' + self.selectedMetacodes[i]).removeClass('toggledOff');
            };
            // uses .slice to avoid setting the two arrays to the same actual array
            self.newSelectedMetacodeNames = self.selectedMetacodeNames.slice(0);
            self.newSelectedMetacodes = self.selectedMetacodes.slice(0);
        }
        $('#metacodeSwitchTabs').tabs("select", self.selectedMetacodeSetIndex);
        $('#topic_name').focus();
    },
    newTopic: {
        init: function () {
            $('#new_topic').bind('contextmenu', function (e) {
                return false;
            });

            $('#topic_name').keyup(function () {
                Metamaps.Create.newTopic.name = $(this).val();
            });

            // initialize the autocomplete results for the metacode spinner
            $('#topic_name').typeahead([
                {
                    name: 'topic_autocomplete',
                    limit: 8,
                    template: $('#topicAutocompleteTemplate').html(),
                    remote: {
                        url: '/topics/autocomplete_topic?term=%QUERY'
                    },
                    engine: Hogan
                  }
            ]);

            // tell the autocomplete to submit the form with the topic you clicked on if you pick from the autocomplete
            $('#topic_name').bind('typeahead:selected', function (event, datum, dataset) {
                Metamaps.Topic.getTopicFromAutocomplete(datum.id);
            });

            // initialize metacode spinner and then hide it
            $("#metacodeImg").CloudCarousel({
                titleBox: $('#metacodeImgTitle'),
                yRadius: 40,
                xPos: 150,
                yPos: 40,
                speed: 0.3,
                mouseWheel: true,
                bringToFront: true
            });
            $('.new_topic').hide();
        },
        name: null,
        newId: 1,
        beingCreated: false,
        metacode: null,
        x: null,
        y: null,
        addSynapse: false,
        open: function () {
            $('#new_topic').fadeIn('fast', function () {
                $('#topic_name').focus();
            });
            Metamaps.Create.newTopic.beingCreated = true;
        },
        hide: function () {
            $('#new_topic').fadeOut('fast');
            $("#topic_name").typeahead('setQuery', '');
            Metamaps.Create.newTopic.beingCreated = false;
        }
    },
    newSynapse: {
        init: function () {
            var self = Metamaps.Create.newSynapse;

            // keep the right click menu from opening
            $('#new_synapse').bind('contextmenu', function (e) {
                return false;
            });

            $('#synapse_desc').keyup(function () {
                Metamaps.Create.newSynapse.description = $(this).val();
            });

            // initialize the autocomplete results for synapse creation
            $('#synapse_desc').typeahead([
                {
                    name: 'synapse_autocomplete',
                    template: "<div>{{label}}</div>",
                    remote: {
                        url: '/search/synapses?term=%QUERY'
                    },
                    engine: Hogan
                },
                {
                    name: 'existing_synapses',
                    limit: 50,
                    template: $('#synapseAutocompleteTemplate').html(),
                    remote: {
                        url: '/search/synapses',
                        replace: function () {
                            return self.getSearchQuery();
                        }
                    },
                    engine: Hogan,
                    header: "<h3>Existing Synapses</h3>"
                }
          ]);

            $('#synapse_desc').bind('typeahead:selected', function (event, datum, dataset) {
                if (datum.id) { // if they clicked on an existing synapse get it
                    Metamaps.Synapse.getSynapseFromAutocomplete(datum.id);
                }
            });
        },
        beingCreated: false,
        description: null,
        topic1id: null,
        topic2id: null,
        newSynapseId: null,
        open: function () {
            $('#new_synapse').fadeIn('fast', function () {
                $('#synapse_desc').focus();
            });
            Metamaps.Create.newSynapse.beingCreated = true;
        },
        hide: function () {
            $('#new_synapse').fadeOut('fast');
            $("#synapse_desc").typeahead('setQuery', '');
            Metamaps.Create.newSynapse.beingCreated = false;
            Metamaps.Create.newTopic.addSynapse = false;
            Metamaps.Create.newSynapse.topic1id = 0;
            Metamaps.Create.newSynapse.topic2id = 0;
        },
        getSearchQuery: function () {
            var self = Metamaps.Create.newSynapse;

            if (Metamaps.Selected.Nodes.length < 2) {
                return '/search/synapses?topic1id=' + self.topic1id + '&topic2id=' + self.topic2id;
            } else return '';
        }
    }
}; // end Metamaps.Create


////////////////// TOPIC AND SYNAPSE CARDS //////////////////////////


/*
 *
 *   TOPICCARD
 *
 */
Metamaps.TopicCard = {
    openTopicCard: null, //stores the JIT local ID of the topic with the topic card open 
    init: function () {

        // initialize best_in_place editing
        $('.authenticated div.permission.canEdit .best_in_place').best_in_place();

        Metamaps.TopicCard.generateShowcardHTML = Hogan.compile($('#topicCardTemplate').html());

        // initialize topic card draggability and resizability
        $('.showcard').draggable({
            handle: ".metacodeImage"
        });
        $('#showcard').resizable({
            maxHeight: 500,
            maxWidth: 500,
            minHeight: 320,
            minWidth: 226,
            resize: function (event, ui) {
                var p = $('#showcard').find('.scroll');
                p.height(p.height()).mCustomScrollbar('update');
            }
        }).css({
            display: 'none',
            top: '300px',
            left: '100px'
        });
    },
    fadeInShowCard: function (topic) {
        $('.showcard').fadeIn('fast');
        Metamaps.TopicCard.openTopicCard = topic.isNew() ? topic.cid : topic.id;
    },
    /**
     * Will open the Topic Card for the node that it's passed
     * @param {$jit.Graph.Node} node
     */
    showCard: function (node) {

        var topic = node.getData('topic');

        //populate the card that's about to show with the right topics data
        Metamaps.TopicCard.populateShowCard(topic);
        Metamaps.TopicCard.fadeInShowCard(topic);
    },
    hideCard: function () {
        $('.showcard').fadeOut('fast');
        Metamaps.TopicCard.openTopicCard = null;
    },
    bindShowCardListeners: function (topic) {
        var self = Metamaps.TopicCard;
        var showCard = document.getElementById('showcard');

        var selectingMetacode = false;
        // attach the listener that shows the metacode title when you hover over the image
        $('.showcard .metacodeImage').mouseenter(function () {
            $('.showcard .icon').css('z-index', '4');
            $('.showcard .metacodeTitle').show();
        });
        $('.showcard .linkItem.icon').mouseleave(function () {
            if (!selectingMetacode) {
                $('.showcard .metacodeTitle').hide();
                $('.showcard .icon').css('z-index', '1');
            }
        });

        $('.showcard .metacodeTitle').click(function () {
            if (!selectingMetacode) {
                selectingMetacode = true;
                $(this).addClass('minimize'); // this line flips the drop down arrow to a pull up arrow
                $('.metacodeSelect').show();
                // add the scroll bar to the list of metacode select options if it isn't already there
                if (!$('.metacodeSelect ul').hasClass('mCustomScrollbar')) {
                    $('.metacodeSelect ul').mCustomScrollbar({
                        mouseWheelPixels: 200,
                        advanced: {
                            updateOnContentResize: true
                        }
                    });

                    $('.metacodeSelect li').click(function () {
                        selectingMetacode = false;
                        var metacodeName = $(this).find('.mSelectName').text();
                        var metacode = Metamaps.Metacodes.findWhere({
                            name: metacodeName
                        });
                        $('.CardOnGraph').find('.metacodeTitle').text(metacodeName)
                            .attr('class', 'metacodeTitle mbg' + metacodeName.replace(/\s/g, ''));
                        $('.CardOnGraph').find('.metacodeImage').css('background-image', 'url(' + metacode.get('icon') + ')');
                        topic.save({
                            metacode_id: metacode.id
                        });
                        Metamaps.Visualize.mGraph.plot();
                        $('.metacodeTitle').removeClass('minimize'); // this line flips the pull up arrow to a drop down arrow
                        $('.metacodeSelect').hide();
                        setTimeout(function () {
                            $('.metacodeTitle').hide();
                            $('.showcard .icon').css('z-index', '1');
                        }, 500);
                    });
                }
            } else {
                selectingMetacode = false;
                $(this).removeClass('minimize'); // this line flips the pull up arrow to a drop down arrow
                $('.metacodeSelect').hide();
            }
        });


        // ability to change permission
        var selectingPermission = false;
        if (topic.authorizePermissionChange(Metamaps.Active.Mapper)) {
            $('.showcard .yourTopic .mapPerm').click(function () {
                if (!selectingPermission) {
                    selectingPermission = true;
                    $(this).addClass('minimize'); // this line flips the drop down arrow to a pull up arrow
                    if ($(this).hasClass('co')) {
                        $(this).append('<ul class="permissionSelect"><li class="public"></li><li class="private"></li></ul>');
                    } else if ($(this).hasClass('pu')) {
                        $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="private"></li></ul>');
                    } else if ($(this).hasClass('pr')) {
                        $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="public"></li></ul>');
                    }
                    $('.permissionSelect li').click(function (event) {
                        selectingPermission = false;
                        var permission = $(this).attr('class');
                        topic.save({
                            permission: permission
                        });
                        $('.showcard .mapPerm').removeClass('co pu pr minimize').addClass(permission.substring(0, 2));
                        $('.permissionSelect').remove();
                        event.stopPropagation();
                    });
                } else {
                    selectingPermission = false;
                    $(this).removeClass('minimize'); // this line flips the pull up arrow to a drop down arrow
                    $('.permissionSelect').remove();
                }
            });
        }

        // when you're typing a description, resize the scroll box to have space
        $('.best_in_place_desc textarea').bind('keyup', function () {
            var s = $('.showcard').find('.scroll');
            s.height(s.height()).mCustomScrollbar('update');
        });

        //bind best_in_place ajax callbacks
        $(showCard).find('.best_in_place_name').bind("ajax:success", function () {

            var s = $('.showcard').find('.scroll');
            s.height(s.height()).mCustomScrollbar('update');

            var name = $(this).html();
            topic.set("name", Metamaps.Util.decodeEntities(name));
            Metamaps.Visualize.mGraph.plot();
        });

        $(showCard).find('.best_in_place_desc').bind("ajax:success", function () {
            this.innerHTML = this.innerHTML.replace(/\r/g, '')

            var s = $('.showcard').find('.scroll');
            s.height(s.height()).mCustomScrollbar('update');

            var desc = $(this).html();
            topic.set("desc", desc);
        });

        $(showCard).find('.best_in_place_link').bind("ajax:success", function () {
            var link = $(this).html();
            $(showCard).find('.go-link').attr('href', link);
            topic.set("link", link);
        });
    },
    populateShowCard: function (topic) {
        var self = Metamaps.TopicCard;

        var showCard = document.getElementById('showcard');

        $(showCard).find('.permission').remove();

        var html = self.generateShowcardHTML.render(self.buildObject(topic));

        if (topic.authorizeToEdit(Metamaps.Active.Mapper)) {
            var perm = document.createElement('div');

            var string = 'permission canEdit';
            if (topic.authorizePermissionChange(Metamaps.Active.Mapper)) string += ' yourTopic';
            perm.className = string;
            perm.innerHTML = html;
            showCard.appendChild(perm);
        } else {
            var perm = document.createElement('div');
            perm.className = 'permission cannotEdit';
            perm.innerHTML = html;
            showCard.appendChild(perm);
        }

        Metamaps.TopicCard.bindShowCardListeners(topic);
    },
    generateShowcardHTML: null, // will be initialized into a Hogan template within init function
    //generateShowcardHTML
    buildObject: function (topic) {
        var nodeValues = {};
        var authorized = topic.authorizeToEdit(Metamaps.Active.Mapper);

        //link is rendered differently if user is logged out or in
        var go_link, a_tag, close_a_tag;
        if (!authorized) {
            go_link = '';
            if (topic.get("link") != "") {
                a_tag = '<a href="' + topic.get("link") + '" target="_blank">';
                close_a_tag = '</a>';
            } else {
                a_tag = '';
                close_a_tag = '';
            }
        } else {
            go_link = '<a href="' + topic.get("link") + '" ' +
                '   class="go-link" target="_blank"></a>';
            a_tag = '';
            close_a_tag = '';
        }

        var desc_nil = "Click to add description...";
        var link_nil = "Click to add link...";

        nodeValues.permission = topic.get("permission");
        nodeValues.mk_permission = topic.get("permission").substring(0, 2);
        //nodeValues.map_count = topic.get("inmaps").length;
        //nodeValues.synapse_count = topic.get("synapseCount");
        nodeValues.id = topic.isNew() ? topic.cid : topic.id;
        nodeValues.metacode = topic.getMetacode().get("name");
        nodeValues.metacode_class = 'mbg' + topic.getMetacode().get("name").replace(/\s/g, '');
        nodeValues.imgsrc = topic.getMetacode().get("icon");
        nodeValues.name = topic.get("name");
        nodeValues.userid = topic.get("user_id");
        nodeValues.username = topic.getUser().get("name");
        nodeValues.date = topic.getDate();

        // the code for this is stored in /views/main/_metacodeOptions.html.erb
        nodeValues.metacode_select = $('#metacodeOptions').html();
        nodeValues.go_link = go_link;
        nodeValues.a_tag = a_tag;
        nodeValues.close_a_tag = close_a_tag;
        nodeValues.link_nil = link_nil;
        nodeValues.link = (topic.get("link") == "" && authorized) ? link_nil : topic.get("link");
        nodeValues.desc_nil = desc_nil;
        nodeValues.desc = (topic.get("desc") == "" && authorized) ? desc_nil : topic.get("desc");
        return nodeValues;
    }
}; // end Metamaps.TopicCard


/*
 *
 *   SYNAPSECARD
 *
 */
Metamaps.SynapseCard = {
    openSynapseCard: null,
    showCard: function (edge, e) {
        var self = Metamaps.SynapseCard;

        //reset so we don't interfere with other edges, but first, save its x and y 
        var myX = $('#edit_synapse').css('left');
        var myY = $('#edit_synapse').css('top');
        $('#edit_synapse').remove();

        //so label is missing while editing
        Metamaps.Control.deselectEdge(edge);

        var synapse = edge.getData('synapses')[0]; // for now, just get the first synapse

        //create the wrapper around the form elements, including permissions
        //classes to make best_in_place happy
        var edit_div = document.createElement('div');
        edit_div.setAttribute('id', 'edit_synapse');
        if (synapse.authorizeToEdit(Metamaps.Active.Mapper)) {
            edit_div.className = 'permission canEdit';
            edit_div.className += synapse.authorizePermissionChange(Metamaps.Active.Mapper) ? ' yourEdge' : '';
        } else {
            edit_div.className = 'permission cannotEdit';
        }
        $('.main .wrapper').append(edit_div);

        self.populateShowCard(synapse);

        //drop it in the right spot, activate it
        $('#edit_synapse').css('position', 'absolute');
        if (e) {
            $('#edit_synapse').css('left', e.clientX);
            $('#edit_synapse').css('top', e.clientY);
        } else {
            $('#edit_synapse').css('left', myX);
            $('#edit_synapse').css('top', myY);
        }
        //$('#edit_synapse_name').click(); //required in case name is empty
        //$('#edit_synapse_name input').focus();
        $('#edit_synapse').show();

        self.openSynapseCard = synapse.isNew() ? synapse.cid : synapse.id;
    },

    hideCard: function () {
        $('#edit_synapse').remove();
        Metamaps.SynapseCard.openSynapseCard = null;
    },

    populateShowCard: function (synapse) {
        var self = Metamaps.SynapseCard;

        self.add_name_form(synapse);
        self.add_user_info(synapse);
        self.add_perms_form(synapse);
        if (synapse.authorizeToEdit(Metamaps.Active.Mapper)) {
            self.add_direction_form(synapse);
        }
    },

    add_name_form: function (synapse) {
        var data_nil = 'Click to add description.';

        // TODO make it so that this would work even in sandbox mode,
        // currently with Best_in_place it won't

        //name editing form
        $('#edit_synapse').append('<div id="edit_synapse_name"></div>');
        $('#edit_synapse_name').attr('class', 'best_in_place best_in_place_desc');
        $('#edit_synapse_name').attr('data-object', 'synapse');
        $('#edit_synapse_name').attr('data-attribute', 'desc');
        $('#edit_synapse_name').attr('data-type', 'textarea');
        $('#edit_synapse_name').attr('data-nil', data_nil);
        $('#edit_synapse_name').attr('data-url', '/synapses/' + synapse.id);
        $('#edit_synapse_name').html(synapse.get("desc"));

        //if edge data is blank or just whitespace, populate it with data_nil
        if ($('#edit_synapse_name').html().trim() == '') {
            $('#edit_synapse_name').html(data_nil);
        }

        $('#edit_synapse_name').bind("ajax:success", function () {
            var desc = $(this).html();
            if (desc == data_nil) {
                synapse.set("desc", '');
            } else {
                synapse.set("desc", desc);
            }
            Metamaps.Control.selectEdge(synapse.get('edge'));
            Metamaps.Visualize.mGraph.plot();
        });
    },

    add_user_info: function (synapse) {
        var u = '<div id="edgeUser" class="hoverForTip">';
        u += '<div class="tip">Created by ' + synapse.getUser().get("name") + '</div></div>';
        $('#edit_synapse').append(u);
    },

    add_perms_form: function (synapse) {
        //permissions - if owner, also allow permission editing
        $('#edit_synapse').append('<div class="mapPerm ' + synapse.get("permission").substring(0, 2) + '"></div>');

        // ability to change permission
        var selectingPermission = false;
        if (synapse.authorizePermissionChange(Metamaps.Active.Mapper)) {
            $('#edit_synapse.yourEdge .mapPerm').click(function () {
                if (!selectingPermission) {
                    selectingPermission = true;
                    $(this).addClass('minimize'); // this line flips the drop down arrow to a pull up arrow
                    if ($(this).hasClass('co')) {
                        $(this).append('<ul class="permissionSelect"><li class="public"></li><li class="private"></li></ul>');
                    } else if ($(this).hasClass('pu')) {
                        $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="private"></li></ul>');
                    } else if ($(this).hasClass('pr')) {
                        $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="public"></li></ul>');
                    }
                    $('#edit_synapse .permissionSelect li').click(function (event) {
                        selectingPermission = false;
                        var permission = $(this).attr('class');
                        synapse.save({
                            permission: permission,
                        });
                        $('#edit_synapse .mapPerm').removeClass('co pu pr minimize').addClass(permission.substring(0, 2));
                        $('#edit_synapse .permissionSelect').remove();
                        event.stopPropagation();
                    });
                } else {
                    selectingPermission = false;
                    $(this).removeClass('minimize'); // this line flips the pull up arrow to a drop down arrow
                    $('#edit_synapse .permissionSelect').remove();
                }
            });
        }
    }, //add_perms_form

    add_direction_form: function (synapse) {
        //directionality checkboxes
        $('#edit_synapse').append('<input type="checkbox" id="edit_synapse_left">');
        $('#edit_synapse').append('<label class="left">&lt;</label>');
        $('#edit_synapse').append('<input type="checkbox" id="edit_synapse_right">');
        $('#edit_synapse').append('<label class="right">&gt;</label>');

        var edge = synapse.get('edge');

        //determine which node is to the left and the right
        //if directly in a line, top is left
        if (edge.nodeFrom.pos.x < edge.nodeTo.pos.x ||
            edge.nodeFrom.pos.x == edge.nodeTo.pos.x &&
            edge.nodeFrom.pos.y < edge.nodeTo.pos.y) {
            var left = edge.nodeTo;
            var right = edge.nodeFrom;
        } else {
            var left = edge.nodeFrom;
            var right = edge.nodeTo;
        }

        /*
         * One node is actually on the left onscreen. Call it left, & the other right.
         * If category is from-to, and that node is first, check the 'right' checkbox.
         * Else check the 'left' checkbox since the arrow is incoming.
         */

        var directionCat = synapse.get('category'); //both, none, from-to
        if (directionCat == 'from-to') {
            var from_to = synapse.getDirection();
            if (from_to[0] == left.id) {
                //check left checkbox
                $('#edit_synapse_left').prop('checked', true);
            } else {
                //check right checkbox
                $('#edit_synapse_right').prop('checked', true);
            }
        } else if (directionCat == 'both') {
            //check both checkboxes
            $('#edit_synapse_left').prop('checked', true);
            $('#edit_synapse_right').prop('checked', true);
        }
        $('#edit_synapse_left, #edit_synapse_right').click(function () {
            var leftChecked = $('#edit_synapse_left').is(':checked');
            var rightChecked = $('#edit_synapse_right').is(':checked');

            var dir = synapse.getDirection();
            var dirCat = 'none';
            if (leftChecked && rightChecked) {
                dirCat = 'both';
            } else if (!leftChecked && rightChecked) {
                dirCat = 'from-to';
                dir = [right.id, left.id];
            } else if (leftChecked && !rightChecked) {
                dirCat = 'from-to';
                dir = [left.id, right.id];
            }

            synapse.save({
                category: dirCat,
                node1_id: dir[0],
                node2_id: dir[1]
            });
            Metamaps.Visualize.mGraph.plot();
        });
    } //add_direction_form
}; // end Metamaps.SynapseCard


////////////////////// END TOPIC AND SYNAPSE CARDS //////////////////////////////////




/*
 *
 *   VISUALIZE
 *
 */
Metamaps.Visualize = {
    mGraph: {}, // a reference to the graph object.
    cameraPosition: null, // stores the camera position when using a 3D visualization
    type: "ForceDirected", // the type of graph we're building, could be "RGraph", "ForceDirected", or "ForceDirected3D"
    savedLayout: true, // indicates whether the map has a saved layout or not
    loadLater: false, // indicates whether there is JSON that should be loaded right in the offset, or whether to wait till the first topic is created
    target: null, // the selector representing the location to render the graph
    init: function () {
        var self = Metamaps.Visualize;
        // disable awkward dragging of the canvas element that would sometimes happen
        $('#infovis-canvas').on('dragstart', function (event) {
            event.preventDefault();
        });

        // prevent touch events on the canvas from default behaviour
        $("#infovis-canvas").bind('touchstart', function (event) {
            event.preventDefault();
            self.mGraph.events.touched = true;
        });

        // prevent touch events on the canvas from default behaviour
        $("#infovis-canvas").bind('touchmove', function (event) {
            //Metamaps.JIT.touchPanZoomHandler(event);
        });

        // prevent touch events on the canvas from default behaviour
        $("#infovis-canvas").bind('touchend touchcancel', function (event) {
            lastDist = 0;
            if (!self.mGraph.events.touchMoved && !Metamaps.Touch.touchDragNode) Metamaps.TopicCard.hideCurrentCard();
            self.mGraph.events.touched = self.mGraph.events.touchMoved = false;
            Metamaps.Touch.touchDragNode = false;
        });
    },
    render: function (targetID, vizData) {
        var self = Metamaps.Visualize;
        self.mGraph = {};
        self.target = targetID;
        self.__buildGraph(vizData);
    },
    computePositions: function () {
        var self = Metamaps.Visualize,
            mapping;

        if (self.type == "RGraph") {
            self.mGraph.graph.eachNode(function (n) {
                topic = Metamaps.Topics.get(n.id);
                topic.set('node', n);
                topic.updateNode();

                n.eachAdjacency(function (edge) {
                    l = edge.getData('synapseIDs').length;
                    for (i = 0; i < l; i++) {
                        synapse = Metamaps.Synapses.get(edge.getData('synapseIDs')[i]);
                        synapse.set('edge', edge);
                        synapse.updateEdge();
                    }
                });
                
                var pos = n.getPos();
                pos.setc(-200, -200);
            });
            self.mGraph.compute('end');
        } else if (self.type == "ForceDirected" && self.savedLayout) {
            var i, l, startPos, endPos, topic, synapse;

            self.mGraph.graph.eachNode(function (n) {
                topic = Metamaps.Topics.get(n.id);
                topic.set('node', n);
                topic.updateNode();
                mapping = topic.getMapping();

                n.eachAdjacency(function (edge) {
                    l = edge.getData('synapseIDs').length;
                    for (i = 0; i < l; i++) {
                        synapse = Metamaps.Synapses.get(edge.getData('synapseIDs')[i]);
                        synapse.set('edge', edge);
                        synapse.updateEdge();
                    }
                });

                startPos = new $jit.Complex(0, 0);
                endPos = new $jit.Complex(mapping.get('xloc'), mapping.get('yloc'));
                n.setPos(startPos, 'start');
                n.setPos(endPos, 'end');
            });
        } else if (self.type == "ForceDirected3D" || !self.savedLayout) {
            self.mGraph.compute();
        }
    },
    /**
     * __buildGraph does the heavy lifting of creating the engine that renders the graph with the properties we desire
     *
     * @param vizData a json structure containing the data to be rendered.
     */
    __buildGraph: function (vizData) {
        var self = Metamaps.Visualize
            RGraphSettings = $.extend(true, {}, Metamaps.JIT.ForceDirected.graphSettings);

        if (self.type == "RGraph") {
            $jit.RGraph.Plot.NodeTypes.implement(Metamaps.JIT.ForceDirected.nodeSettings);
            $jit.RGraph.Plot.EdgeTypes.implement(Metamaps.JIT.ForceDirected.edgeSettings);
            
            RGraphSettings.background = Metamaps.JIT.RGraph.background;
            RGraphSettings.levelDistance = Metamaps.JIT.RGraph.levelDistance;
            
            self.mGraph = new $jit.RGraph(RGraphSettings);
        } else if (self.type == "ForceDirected") {
            $jit.ForceDirected.Plot.NodeTypes.implement(Metamaps.JIT.ForceDirected.nodeSettings);
            $jit.ForceDirected.Plot.EdgeTypes.implement(Metamaps.JIT.ForceDirected.edgeSettings);
            self.mGraph = new $jit.ForceDirected(Metamaps.JIT.ForceDirected.graphSettings);
        } else if (self.type == "ForceDirected3D") {
            // init ForceDirected3D
            self.mGraph = new $jit.ForceDirected3D(Metamaps.JIT.ForceDirected3D.graphSettings);
            self.cameraPosition = self.mGraph.canvas.canvases[0].camera.position;
        }

        // load JSON data, if it's not empty
        if (!self.loadLater) {
            //load JSON data.
            self.mGraph.loadJSON(vizData);
            //compute positions and plot.
            self.computePositions();
            if (self.type == "RGraph") {
                self.mGraph.fx.animate(Metamaps.JIT.RGraph.animate);
            } else if (self.type == "ForceDirected" && self.savedLayout) {
                Metamaps.Organize.loadSavedLayout();
            } else if (self.type == "ForceDirected3D" || !self.savedLayout) {
                self.mGraph.animate(Metamaps.JIT.ForceDirected.animateFDLayout);
            }
        }
    }
}; // end Metamaps.Visualize


/*
 *
 *   UTIL
 *
 */
Metamaps.Util = {
    // helper function to determine how many lines are needed
    // Line Splitter Function
    // copyright Stephen Chapman, 19th April 2006
    // you may copy this code but please keep the copyright notice as well
    splitLine: function (st, n) {
        var b = '';
        var s = st;
        while (s.length > n) {
            var c = s.substring(0, n);
            var d = c.lastIndexOf(' ');
            var e = c.lastIndexOf('\n');
            if (e != -1) d = e;
            if (d == -1) d = n;
            b += c.substring(0, d) + '\n';
            s = s.substring(d + 1);
        }
        return b + s;
    },
    decodeEntities: function (desc) {
        var str, temp = document.createElement('p');
        temp.innerHTML = desc; //browser handles the topics
        str = temp.textContent || temp.innerText;
        temp = null; //delete the element;
        return str;
    }, //decodeEntities
    getDistance: function (p1, p2) {
        return Math.sqrt(Math.pow((p2.x - p1.x), 2) + Math.pow((p2.y - p1.y), 2));
    },
    generateOptionsList: function (data) {
        var newlist = "";
        for (var i = 0; i < data.length; i++) {
            newlist = newlist + '<option value="' + data[i]['id'] + '">' + data[i]['1'][1] + '</option>';
        }
        return newlist;
    },
    checkURLisImage: function (url) {
        // when the page reloads the following regular expression will be screwed up
        // please replace it with this one before you save: /*backslashhere*.(jpeg|jpg|gif|png)$/ 
        return (url.match(/\.(jpeg|jpg|gif|png)$/) != null);
    },
    checkURLisYoutubeVideo: function (url) {
        return (url.match(/^http:\/\/(?:www\.)?youtube.com\/watch\?(?=[^?]*v=\w+)(?:[^\s?]+)?$/) != null);
    }
}; // end Metamaps.Util

/*
 *
 *   REALTIME
 *
 */
Metamaps.Realtime = {
    // this is for the heroku staging environment
    //Metamaps.Realtime.socket = io.connect('http://gentle-savannah-1303.herokuapp.com'); 
    // this is for metamaps.cc
    //Metamaps.Realtime.socket = io.connect('http://metamaps.cc:5001');    
    // this is for localhost development    
    //Metamaps.Realtime.socket = io.connect('http://localhost:5001'); 
    socket: null,
    isOpen: false,
    timeOut: null,
    changing: false,
    mappersOnMap: {},
    status: true, // stores whether realtime is True/On or False/Off
    init: function () {
        var self = Metamaps.Realtime;

        $(".realtimeOnOff").click(self.toggle);

        $(".sidebarCollaborate").hover(self.open, self.close);

        var mapperm = Metamaps.Active.Map && Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        if (mapperm) {
            self.socket = io.connect('http://localhost:5001');
            self.socket.on('connect', function () {
                console.log('socket connected');
                self.setupSocket();
            });
        }
    },
    toggle: function () {
        var self = Metamaps.Realtime;

        if (!self.status) {
            self.sendRealtimeOn();
            $(this).html('ON').removeClass('rtOff').addClass('rtOn');
            $(".rtMapperSelf").removeClass('littleRtOff').addClass('littleRtOn');
        } else {
            self.sendRealtimeOff();
            $(this).html('OFF').removeClass('rtOn').addClass('rtOff');
            $(".rtMapperSelf").removeClass('littleRtOn').addClass('littleRtOff');
        }
        self.status = !self.status;
        $(".sidebarCollaborateIcon").toggleClass("blue");
    },
    open: function () {
        var self = Metamaps.Realtime;

        clearTimeout(self.timeOut);
        if (!self.isOpen && !self.changing) {
            self.changing = true;
            $('.sidebarCollaborateBox').fadeIn(200, function () {
                self.changing = false;
                self.isOpen = true;
            });
        }
    },
    close: function () {
        var self = Metamaps.Realtime;

        self.timeOut = setTimeout(function () {
            if (!self.changing) {
                self.changing = true;
                $('.sidebarCollaborateBox').fadeOut(200, function () {
                    self.changing = false;
                    self.isOpen = false;
                });
            }
        }, 500);
    },
    setupSocket: function () {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;
        var myId = Metamaps.Active.Mapper.id;
        
        socket.emit('newMapperNotify', {
            userid: myId,
            username: Metamaps.Active.Mapper.get("name"),
            mapid: Metamaps.Active.Map.id
        });

        // if you're the 'new guy' update your list with who's already online
        socket.on(myId + '-' + Metamaps.Active.Map.id + '-UpdateMapperList', self.updateMapperList);

        // receive word that there's a new mapper on the map
        socket.on('maps-' + Metamaps.Active.Map.id + '-newmapper', self.newPeerOnMap);

        // receive word that a mapper left the map
        socket.on('maps-' + Metamaps.Active.Map.id + '-lostmapper', self.lostPeerOnMap);

        // receive word that there's a mapper turned on realtime
        socket.on('maps-' + Metamaps.Active.Map.id + '-newrealtime', self.newCollaborator);

        // receive word that there's a mapper turned on realtime
        socket.on('maps-' + Metamaps.Active.Map.id + '-lostrealtime', self.lostCollaborator);

        socket.on('maps-' + Metamaps.Active.Map.id, self.contentUpdate);
    },
    sendRealtimeOn: function () {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // send this new mapper back your details, and the awareness that you're online
        var update = {
            username: Metamaps.Active.Mapper.get("name"),
            userid: Metamaps.Active.Mapper.id,
            mapid: Metamaps.Active.Map.id
        };
        socket.emit('notifyStartRealtime', update);
    },
    sendRealtimeOff: function () {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // send this new mapper back your details, and the awareness that you're online
        var update = {
            username: Metamaps.Active.Mapper.get("name"),
            userid: Metamaps.Active.Mapper.id,
            mapid: Metamaps.Active.Map.id
        };
        socket.emit('notifyStopRealtime', update);
    },
    updateMapperList: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // data.userid
        // data.username
        // data.userrealtime

        self.mappersOnMap[data.userid] = {
            name: data.username,
            realtime: data.userrealtime
        };

        var onOff = data.userrealtime ? "On" : "Off";
        var mapperListItem = '<li id="mapper';
        mapperListItem += data.userid;
        mapperListItem += '" class="rtMapper littleRt';
        mapperListItem += onOff;
        mapperListItem += '">' + data.username + '</li>';

        $('#mapper' + data.userid).remove();
        $('.realtimeMapperList ul').append(mapperListItem);
    },
    newPeerOnMap: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // data.userid
        // data.username

        self.mappersOnMap[data.userid] = {
            name: data.username,
            realtime: true
        };

        var mapperListItem = '<li id="mapper' + data.userid + '" class="rtMapper littleRtOn">' + data.username + '</li>';
        $('#mapper' + data.userid).remove();
        $('.realtimeMapperList ul').append(mapperListItem);

        Metamaps.GlobalUI.notifyUser(data.username + ' just joined the map');

        // send this new mapper back your details, and the awareness that you've loaded the map
        var update = {
            userToNotify: data.userid,
            username: Metamaps.Active.Mapper.get("name"),
            userid: Metamaps.Active.Mapper.id,
            userrealtime: self.status,
            mapid: Metamaps.Active.Map.id
        };
        socket.emit('updateNewMapperList', update);
    },
    lostPeerOnMap: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // data.userid
        // data.username

        delete self.mappersOnMap[data.userid];

        $('#mapper' + data.userid).remove();

        Metamaps.GlobalUI.notifyUser(data.username + ' just left the map');
    },
    newCollaborator: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // data.userid
        // data.username

        self.mappersOnMap[data.userid].realtime = true;

        $('#mapper' + data.userid).removeClass('littleRtOff').addClass('littleRtOn');

        Metamaps.GlobalUI.notifyUser(data.username + ' just turned on realtime');
    },
    lostCollaborator: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;

        // data.userid
        // data.username

        self.mappersOnMap[data.userid].realtime = false;

        $('#mapper' + data.userid).removeClass('littleRtOn').addClass('littleRtOff');

        Metamaps.GlobalUI.notifyUser(data.username + ' just turned off realtime');
    },
    contentUpdate: function (data) {
        var self = Metamaps.Realtime;
        var socket = Metamaps.Realtime.socket;
        var graph = Metamaps.Visualize.mGraph.graph;

        //as long as you weren't the origin of the changes, update your map
        if (data.origin != Metamaps.Active.Mapper.id && self.status) {
            if (data.resource == 'Topic') {
                topic = $.parseJSON(data.obj);

                if (data.action == 'create') {
                    self.addTopicToMap(topic);
                } else if (data.action == 'update' && graph.getNode(topic.id) != 'undefined') {
                    self.updateTopicOnMap(topic);
                } else if (data.action == 'destroy' && graph.getNode(topic.id) != 'undefined') {
                    Metamaps.Control.hideNode(topic.id)
                }

                return;
            } else if (data.resource == 'Synapse') {
                synapse = $.parseJSON(data.obj);

                if (data.action == 'create') {
                    self.addSynapseToMap(synapse);
                } else if (data.action == 'update' &&
                    graph.getAdjacence(synapse.data.$direction['0'], synapse.data.$direction['1']) != 'undefined') {
                    self.updateSynapseOnMap(synapse);
                } else if (data.action == 'destroy' &&
                    graph.getAdjacence(synapse.data.$direction['0'], synapse.data.$direction['1']) != 'undefined') {
                    var edge = graph.getAdjacence(synapse.data.$direction['0'], synapse.data.$direction['1']);
                    Metamaps.Control.hideEdge(edge);
                }

                return;
            }
        }
    },
    addTopicToMap: function (topic) {

        // TODO
        var newPos, tempForT;
        Metamaps.Visualize.mGraph.graph.addNode(topic);
        tempForT = Metamaps.Visualize.mGraph.graph.getNode(topic.id);
        tempForT.setData('dim', 1, 'start');
        tempForT.setData('dim', 25, 'end');
        newPos = new $jit.Complex();
        newPos.x = tempForT.data.$xloc;
        newPos.y = tempForT.data.$yloc;
        tempForT.setPos(newPos, 'start');
        tempForT.setPos(newPos, 'current');
        tempForT.setPos(newPos, 'end');
        Metamaps.Visualize.mGraph.fx.plotNode(tempForT, Metamaps.Visualize.mGraph.canvas);
    },
    updateTopicOnMap: function (topic) {

        // TODO
        var newPos, tempForT;
        tempForT = Metamaps.Visualize.mGraph.graph.getNode(topic.id);
        tempForT.data = topic.data;
        tempForT.name = topic.name;
        if (MetamapsModel.showcardInUse === topic.id) {
            populateShowCard(tempForT);
        }
        newPos = new $jit.Complex();
        newPos.x = tempForT.data.$xloc;
        newPos.y = tempForT.data.$yloc;
        tempForT.setPos(newPos, 'start');
        tempForT.setPos(newPos, 'current');
        tempForT.setPos(newPos, 'end');
        return Metamaps.Visualize.mGraph.fx.animate({
            modes: ['linear', 'node-property:dim', 'edge-property:lineWidth'],
            transition: $jit.Trans.Quad.easeInOut,
            duration: 500
        });
    },
    addSynapseToMap: function (synapse) {

        // TODO
        var Node1, Node2, tempForS;
        Node1 = Metamaps.Visualize.mGraph.graph.getNode(synapse.data.$direction[0]);
        Node2 = Metamaps.Visualize.mGraph.graph.getNode(synapse.data.$direction[1]);
        Metamaps.Visualize.mGraph.graph.addAdjacence(Node1, Node2, {});
        tempForS = Metamaps.Visualize.mGraph.graph.getAdjacence(Node1.id, Node2.id);
        tempForS.setDataset('start', {
            lineWidth: 0.4
        });
        tempForS.setDataset('end', {
            lineWidth: 2
        });
        tempForS.data = synapse.data;
        Metamaps.Visualize.mGraph.fx.plotLine(tempForS, Metamaps.Visualize.mGraph.canvas);
        return Metamaps.Visualize.mGraph.fx.animate({
            modes: ['linear', 'node-property:dim', 'edge-property:lineWidth'],
            transition: $jit.Trans.Quad.easeInOut,
            duration: 500
        });
    },
    updateSynapseOnMap: function (synapse) {

        // TODO
        var k, tempForS, v, wasShowDesc, _ref;
        tempForS = Metamaps.Visualize.mGraph.graph.getAdjacence(synapse.data.$direction[0], synapse.data.$direction[1]);
        wasShowDesc = tempForS.data.$showDesc;
        _ref = synapse.data;
        for (k in _ref) {
            v = _ref[k];
            tempForS.data[k] = v;
        }
        tempForS.data.$showDesc = wasShowDesc;
        if (MetamapsModel.edgecardInUse === synapse.data.$id) { // TODO
            editEdge(tempForS, false);
        }
        return Metamaps.Visualize.mGraph.plot();
    }
}; // end Metamaps.Realtime


/*
 *
 *   CONTROL
 *
 */
Metamaps.Control = {
    init: function () {

    },
    selectNode: function (node) {
        if (Metamaps.Selected.Nodes.indexOf(node) != -1) return;
        node.selected = true;
        node.setData('dim', 30, 'current');
        node.eachAdjacency(function (adj) {
            Metamaps.Control.selectEdge(adj);
        });
        Metamaps.Selected.Nodes.push(node);
    },
    deselectAllNodes: function () {
        var l = Metamaps.Selected.Nodes.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            var node = Metamaps.Selected.Nodes[i];
            Metamaps.Control.deselectNode(node);
        }
        Metamaps.Visualize.mGraph.plot();
    },
    deselectNode: function (node) {
        delete node.selected;
        node.eachAdjacency(function (adj) {
            Metamaps.Control.deselectEdge(adj);
        });
        node.setData('dim', 25, 'current');

        //remove the node
        Metamaps.Selected.Nodes.splice(
            Metamaps.Selected.Nodes.indexOf(node), 1);
    },
    deleteSelectedNodes: function () { // refers to deleting topics permanently
        var l = Metamaps.Selected.Nodes.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            var node = Metamaps.Selected.Nodes[i];
            Metamaps.Control.deleteNode(node.id);
        }
    },
    deleteNode: function (nodeid) { // refers to deleting topics permanently
        var node = Metamaps.Visualize.mGraph.graph.getNode(nodeid);
        var id = node.getData('id');
        Metamaps.Control.deselectNode(node);
        Metamaps.Topics.get(id).destroy();
        Metamaps.Control.hideNode(nodeid);
    },
    removeSelectedNodes: function () { // refers to removing topics permanently from a map
        var l = Metamaps.Selected.Nodes.length,
            i,
            node,
            mapperm = Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        if (mapperm) {
            for (i = l - 1; i >= 0; i -= 1) {
                node = Metamaps.Selected.Nodes[i];
                Metamaps.Control.removeNode(node.id);
            }
        }
    },
    removeNode: function (nodeid) { // refers to removing topics permanently from a map
        var mapperm = Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);
        var node = Metamaps.Visualize.mGraph.graph.getNode(nodeid);
        var mappingid = node.getData("mapping").id;

        if (mapperm) {
            Metamaps.Control.deselectNode(node);
            Metamaps.Mappings.get(mappingid).destroy();
            Metamaps.Control.hideNode(nodeid);
        }
    },
    hideSelectedNodes: function () {
        var l = Metamaps.Selected.Nodes.length,
            i,
            node;

        for (i = l - 1; i >= 0; i -= 1) {
            node = Metamaps.Selected.Nodes[i];
            Metamaps.Control.hideNode(node.id);
        }
    },
    hideNode: function (nodeid) {
        var node = Metamaps.Visualize.mGraph.graph.getNode(nodeid);
        if (nodeid == Metamaps.Visualize.mGraph.root) { // && Metamaps.Visualize.type === "RGraph"
            alert("You can't hide this topic, it is the root of your graph.");
            return;
        }

        Metamaps.Control.deselectNode(node);

        node.setData('alpha', 0, 'end');
        node.eachAdjacency(function (adj) {
            adj.setData('alpha', 0, 'end');
        });
        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['node-property:alpha',
            'edge-property:alpha'
        ],
            duration: 500
        });
        setTimeout(function () {
            Metamaps.Visualize.mGraph.graph.removeNode(nodeid);
        }, 500);
    },
    selectEdge: function (edge) {
        if (Metamaps.Selected.Edges.indexOf(edge) != -1) return;
        edge.setData('showDesc', true, 'current');
        if (!Metamaps.Settings.embed) {
            edge.setDataset('end', {
                lineWidth: 4,
                color: Metamaps.Settings.colors.synapses.selected,
                alpha: 1
            });
        } else if (Metamaps.Settings.embed) {
            edge.setDataset('end', {
                lineWidth: 4,
                color: Metamaps.Settings.colors.synapses.selected,
                alpha: 1
            });
        }
        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['edge-property:lineWidth:color:alpha'],
            duration: 100
        });
        Metamaps.Selected.Edges.push(edge);
    },
    deselectAllEdges: function () {
        var l = Metamaps.Selected.Edges.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            var edge = Metamaps.Selected.Edges[i];
            Metamaps.Control.deselectEdge(edge);
        }
        Metamaps.Visualize.mGraph.plot();
    },
    deselectEdge: function (edge) {
        edge.setData('showDesc', false, 'current');
        edge.setDataset('end', {
            lineWidth: 2,
            color: Metamaps.Settings.colors.synapses.normal,
            alpha: 0.4
        });

        if (Metamaps.Mouse.edgeHoveringOver == edge) {
            edge.setData('showDesc', true, 'current');
            edge.setDataset('end', {
                lineWidth: 4,
                color: Metamaps.Settings.colors.synapses.hover,
                alpha: 1
            });
        }

        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['edge-property:lineWidth:color:alpha'],
            duration: 100
        });

        //remove the edge
        Metamaps.Selected.Edges.splice(
            Metamaps.Selected.Edges.indexOf(edge), 1);
    },
    deleteSelectedEdges: function () { // refers to deleting topics permanently
        var edge,
            l = Metamaps.Selected.Edges.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            edge = Metamaps.Selected.Edges[i];
            Metamaps.Control.deleteEdge(edge);
        }
    },
    deleteEdge: function (edge) {

        // TODO make it so that you select which one, of multiple possible synapses you want to delete

        //var id = edge.getData("id");
        //Metamaps.Synapses.get(id).destroy();
        //Metamaps.Control.hideEdge(edge);
    },
    removeSelectedEdges: function () {
        var l = Metamaps.Selected.Edges.length,
            i,
            edge;

        if (Metamaps.Active.Map) {
            for (i = l - 1; i >= 0; i -= 1) {
                edge = Metamaps.Selected.Edges[i];
                Metamaps.Control.removeEdge(edge);
            }
            Metamaps.Selected.Edges = new Array();
        }
    },
    removeEdge: function (edge) {

        // TODO make it so that you select which one, of multiple possible synapses you want

        //var mappingid = edge.getData("mappingid");
        //Metamaps.Mappings.get(mappingid).destroy();
        //Metamaps.Control.hideEdge(edge);
    },
    hideSelectedEdges: function () {
        var edge,
            l = Metamaps.Selected.Edges.length,
            i;
        for (i = l - 1; i >= 0; i -= 1) {
            edge = Metamaps.Selected.Edges[i];
            Metamaps.Control.hideEdge(edge);
        }
        Metamaps.Selected.Edges = new Array();
    },
    hideEdge: function (edge) {
        var from = edge.nodeFrom.id;
        var to = edge.nodeTo.id;
        edge.setData('alpha', 0, 'end');
        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['edge-property:alpha'],
            duration: 500
        });
        setTimeout(function () {
            Metamaps.Visualize.mGraph.graph.removeAdjacence(from, to);
        }, 500);
    },
    updateSelectedPermissions: function (permission) {

        var edge, synapse, node, topic;

        Metamaps.GlobalUI.notifyUser('Working...');

        // variables to keep track of how many nodes and synapses you had the ability to change the permission of
        var nCount = 0,
            sCount = 0;

        // change the permission of the selected synapses, if logged in user is the original creator
        var l = Metamaps.Selected.Edges.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            edge = Metamaps.Selected.Edges[i];
            synapse = edge.getData('synapses')[0];

            if (synapse.authorizePermissionChange(Metamaps.Active.Mapper)) {
                synapse.save({
                    permission: permission
                });
                sCount++;
            }
        }

        // change the permission of the selected topics, if logged in user is the original creator
        var l = Metamaps.Selected.Nodes.length;
        for (var i = l - 1; i >= 0; i -= 1) {
            node = Metamaps.Selected.Nodes[i];
            topic = node.getData('topic');

            if (topic.authorizePermissionChange(Metamaps.Active.Mapper)) {
                topic.save({
                    permission: permission
                });
                nCount++;
            }
        }

        var nString = nCount == 1 ? (nCount.toString() + ' topic and ') : (nCount.toString() + ' topics and ');
        var sString = sCount == 1 ? (sCount.toString() + ' synapse') : (sCount.toString() + ' synapses');

        var message = nString + sString + ' you created updated to ' + permission;
        Metamaps.GlobalUI.notifyUser(message);
    },
}; // end Metamaps.Control


/*
 *
 *   FILTER
 *
 */
Metamaps.Filter = {
    filters: {
        name: "",
        metacode: [],
        mappers: [],
        synapseTypes: []
    },
    isOpen: false,
    timeOut: null,
    changing: false,
    init: function () {
        var self = Metamaps.Filter;

        $(".sidebarFilter").hover(self.open, self.close);

        // initialize scroll bar for filter by metacode, then hide it and position it correctly again
        $("#filter_by_metacode").mCustomScrollbar({
            mouseWheelPixels: 200,
            advanced: {
                updateOnContentResize: true
            }
        });
        $('.sidebarFilterBox').hide().css({
            position: 'absolute',
            top: '45px',
            right: '-36px'
        });

        $('.sidebarFilterBox .showAll').click(self.filterNoMetacodes);
        $('.sidebarFilterBox .hideAll').click(self.filterAllMetacodes);

        // toggle visibility of topics with metacodes based on status in the filters list
        $('#filter_by_metacode ul li').click(self.toggleMetacode);
    },
    open: function () {
        var self = Metamaps.Filter;

        clearTimeout(self.timeOut);
        if (!self.isOpen && !self.changing) {
            self.changing = true;

            $('.sidebarFilterBox').fadeIn(200, function () {
                self.changing = false;
                self.isOpen = true;
            });
        }
    },
    close: function () {
        var self = Metamaps.Filter;

        self.timeOut = setTimeout(function () {
            if (!self.changing) {
                self.changing = true;

                $('.sidebarFilterBox').fadeOut(200, function () {
                    self.changing = false;
                    self.isOpen = false;
                });
            }
        }, 500);
    },
    filterNoMetacodes: function (e) {

        $('#filter_by_metacode ul li').removeClass('toggledOff');

        // TODO
        /*
        showAll();
        
        for (var catVis in categoryVisible) {
            categoryVisible[catVis] = true;
        }
        */
    },
    filterAllMetacodes: function (e) {

        $('#filter_by_metacode ul li').addClass('toggledOff');

        // TODO
        /*
        hideAll();
        for (var catVis in categoryVisible) {
            categoryVisible[catVis] = false;
        }
        */
    },
    toggleMetacode: function () {

        var category = $(this).children('img').attr('alt');

        // TODO
        /*switchVisible(category);

        // toggle the image and the boolean array value
        if (categoryVisible[category] == true) {
            $(this).addClass('toggledOff');
            categoryVisible[category] = false;
        } else if (categoryVisible[category] == false) {
            $(this).removeClass('toggledOff');
            categoryVisible[category] = true;
        }*/
    },
    passFilters: function (topic) {
        var self = Metamaps.Find;
        var filters = self.filters;

        var passesName = filters.name == "" ? true : false,
            passesType = filters.type == [] ? true : false;

        //filter by name
        if (topic.get('1')[1][0].toLowerCase().indexOf(filters.name) !== -1) {
            passesName = true;
        }
        // filter by type
        if (!filters.type == []) {
            // get the array of types that your topic 'is'
            var metacodes = topic.get('2') ? topic.get('2')[1] : [];
            if (_.intersection(filters.type, metacodes).length == 0) passesType = true;
        }

        if (passesName && passesType) {
            return true;
        } else {
            return false;
        }
    }
}; // end Metamaps.Filter


/*
 *
 *   LISTENERS
 *
 */
Metamaps.Listeners = {

    init: function () {

        $(document).on('keydown', function (e) {
            switch (e.which) {
            case 13:
                Metamaps.JIT.enterKeyHandler();
                e.preventDefault();
                break;
            case 27:
                Metamaps.JIT.escKeyHandler();
                break;
            default:
                break; //alert(e.which);
            }
        });

        //$(window).resize(function () {
        //    Metamaps.Visualize.mGraph.canvas.resize($(window).width(), $(window).height());
        //});
    }
}; // end Metamaps.Listeners


/*
 *
 *   ORGANIZE
 *
 */
Metamaps.Organize = {
    init: function () {

    },
    arrange: function (layout, centerNode) {


        // first option for layout to implement is 'grid', will do an evenly spaced grid with its center at the 0,0 origin
        if (layout == 'grid') {
            var numNodes = _.size(Metamaps.Visualize.mGraph.graph.nodes); // this will always be an integer, the # of nodes on your graph visualization
            var numColumns = Math.floor(Math.sqrt(numNodes)); // the number of columns to make an even grid
            var GRIDSPACE = 400;
            var row = 0;
            var column = 0;
            Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                if (column == numColumns) {
                    column = 0;
                    row += 1;
                }
                var newPos = new $jit.Complex();
                newPos.x = column * GRIDSPACE;
                newPos.y = row * GRIDSPACE;
                n.setPos(newPos, 'end');
                column += 1;
            });
            Metamaps.Visualize.mGraph.animate(Metamaps.JIT.ForceDirected.animateSavedLayout);
        } else if (layout == 'grid_full') {

            // this will always be an integer, the # of nodes on your graph visualization
            var numNodes = _.size(Metamaps.Visualize.mGraph.graph.nodes);
            //var numColumns = Math.floor(Math.sqrt(numNodes)); // the number of columns to make an even grid
            //var GRIDSPACE = 400;
            var height = Metamaps.Visualize.mGraph.canvas.getSize(0).height;
            var width = Metamaps.Visualize.mGraph.canvas.getSize(0).width;
            var totalArea = height * width;
            var cellArea = totalArea / numNodes;
            var ratio = height / width;
            var cellWidth = sqrt(cellArea / ratio);
            var cellHeight = cellArea / cellWidth;
            var row = floor(height / cellHeight);
            var column = floor(width / cellWidth);
            var totalCells = row * column;

            if (totalCells)
                Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                    if (column == numColumns) {
                        column = 0;
                        row += 1;
                    }
                    var newPos = new $jit.Complex();
                    newPos.x = column * GRIDSPACE;
                    newPos.y = row * GRIDSPACE;
                    n.setPos(newPos, 'end');
                    column += 1;
                });
            Metamaps.Visualize.mGraph.animate(Metamaps.JIT.ForceDirected.animateSavedLayout);
        } else if (layout == 'radial') {

            var centerX = centerNode.getPos().x;
            var centerY = centerNode.getPos().y;
            centerNode.setPos(centerNode.getPos(), 'end');

            console.log(centerNode.adjacencies);
            var lineLength = 200;
            var usedNodes = {};
            usedNodes[centerNode.id] = centerNode;
            var radial = function (node, level, degree) {
                if (level == 1) {
                    var numLinksTemp = _.size(node.adjacencies);
                    var angleTemp = 2 * Math.PI / numLinksTemp;
                } else {
                    angleTemp = 2 * Math.PI / 20
                };
                node.eachAdjacency(function (a) {
                    var isSecondLevelNode = (centerNode.adjacencies[a.nodeTo.id] != undefined && level > 1);
                    if (usedNodes[a.nodeTo.id] == undefined && !isSecondLevelNode) {
                        var newPos = new $jit.Complex();
                        newPos.x = level * lineLength * Math.sin(degree) + centerX;
                        newPos.y = level * lineLength * Math.cos(degree) + centerY;
                        a.nodeTo.setPos(newPos, 'end');
                        usedNodes[a.nodeTo.id] = a.nodeTo;

                        radial(a.nodeTo, level + 1, degree);
                        degree += angleTemp;
                    };
                });
            };
            radial(centerNode, 1, 0);
            Metamaps.Visualize.mGraph.animate(Metamaps.JIT.ForceDirected.animateSavedLayout);

        } else if (layout == 'center_viewport') {

            var lowX = 0,
                lowY = 0,
                highX = 0,
                highY = 0;
            var oldOriginX = Metamaps.Visualize.mGraph.canvas.translateOffsetX;
            var oldOriginY = Metamaps.Visualize.mGraph.canvas.translateOffsetY;

            Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                if (n.id === 1) {
                    lowX = n.getPos().x;
                    lowY = n.getPos().y;
                    highX = n.getPos().x;
                    highY = n.getPos().y;
                };
                if (n.getPos().x < lowX) lowX = n.getPos().x;
                if (n.getPos().y < lowY) lowY = n.getPos().y;
                if (n.getPos().x > highX) highX = n.getPos().x;
                if (n.getPos().y > highY) highY = n.getPos().y;
            });
            console.log(lowX, lowY, highX, highY);
            var newOriginX = (lowX + highX) / 2;
            var newOriginY = (lowY + highY) / 2;

        } else alert('please call function with a valid layout dammit!');
    },
    loadSavedLayout: function (id) {
        Metamaps.Visualize.computePositions();
        Metamaps.Visualize.mGraph.animate(Metamaps.JIT.ForceDirected.animateSavedLayout);
    },
}; // end Metamaps.Organize


/*
 *
 *   TOPIC
 *
 */
Metamaps.Topic = {
    // this function is to retrieve a topic JSON object from the database
    // @param id = the id of the topic to retrieve
    get: function (id, callback) {
        // if the desired topic is not yet in the local topic repository, fetch it
        if (Metamaps.Topics.get(id) == undefined) {
            //console.log("Ajax call!");
            if (!callback) {
                var e = $.ajax({
                    url: "/topics/" + id + ".json",
                    async: false
                });
                Metamaps.Topics.add($.parseJSON(e.responseText));
                return Metamaps.Topics.get(id);
            } else {
                return $.ajax({
                    url: "/topics/" + id + ".json",
                    success: function (data) {
                        Metamaps.Topics.add(data);
                        callback(Metamaps.Topics.get(id));
                    }
                });
            }
        } else {
            if (!callback) {
                return Metamaps.Topics.get(id);
            } else {
                return callback(Metamaps.Topics.get(id));
            }
        }
    },

    /*
     *
     *
     */
    renderTopic: function (mapping, topic, createNewInDB) {
        var self = Metamaps.Topic;

        var nodeOnViz, tempPos;

        var newnode = topic.createNode();

        if (!$.isEmptyObject(Metamaps.Visualize.mGraph.graph.nodes)) {
            Metamaps.Visualize.mGraph.graph.addNode(newnode);
            Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                n.setData("dim", 25, "start");
                n.setData("dim", 25, "end");
            });
            nodeOnViz = Metamaps.Visualize.mGraph.graph.getNode(newnode.id);
            topic.set('node', nodeOnViz);
            topic.updateNode(); // links the topic and the mapping to the node    


            nodeOnViz.setData("dim", 1, "start");
            nodeOnViz.setData("dim", 25, "end");
            if (Metamaps.Visualize.type === "RGraph") {
                tempPos = new $jit.Complex(mapping.get('xloc'), mapping.get('yloc'));
                tempPos = tempPos.toPolar();
                nodeOnViz.setPos(tempPos, "current");
                nodeOnViz.setPos(tempPos, "start");
                nodeOnViz.setPos(tempPos, "end");
            } else if (Metamaps.Visualize.type === "ForceDirected") {
                nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "current");
                nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "start");
                nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "end");
            }
            if (Metamaps.Create.newTopic.addSynapse) {
                Metamaps.Create.newSynapse.topic1id = tempNode.id;
                Metamaps.Create.newSynapse.topic2id = nodeOnViz.id;
                Metamaps.Create.newSynapse.open();
                Metamaps.Visualize.mGraph.fx.animate({
                    modes: ["node-property:dim"],
                    duration: 500,
                    onComplete: function () {
                        tempNode = null;
                        tempNode2 = null;
                        tempInit = false;
                    }
                });
            } else {
                Metamaps.Visualize.mGraph.fx.plotNode(nodeOnViz, Metamaps.Visualize.mGraph.canvas);
                Metamaps.Visualize.mGraph.fx.animate({
                    modes: ["node-property:dim"],
                    duration: 500,
                    onComplete: function () {

                    }
                });
            }
        } else {
            Metamaps.Visualize.mGraph.loadJSON(newnode);
            nodeOnViz = Metamaps.Visualize.mGraph.graph.getNode(newnode.id);
            topic.set('node', nodeOnViz);
            topic.updateNode(); // links the topic and the mapping to the node 

            nodeOnViz.setData("dim", 1, "start");
            nodeOnViz.setData("dim", 25, "end");
            nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "current");
            nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "start");
            nodeOnViz.setPos(new $jit.Complex(mapping.get('xloc'), mapping.get('yloc')), "end");
            Metamaps.Visualize.mGraph.fx.plotNode(nodeOnViz, Metamaps.Visualize.mGraph.canvas);
            Metamaps.Visualize.mGraph.fx.animate({
                modes: ["node-property:dim"],
                duration: 500,
                onComplete: function () {

                }
            });
        }

        if (!Metamaps.Settings.sandbox && createNewInDB) {
            if (topic.isNew()) {
                topic.save(null, {
                    success: function (topicModel, response) {
                        if (Metamaps.Active.Map) {
                            mapping.save({ topic_id: topicModel.id });
                        }
                    },
                    error: function (model, response) {
                        console.log('error saving topic to database');
                    }
                });
            } else if (!topic.isNew() && Metamaps.Active.Map) {
                mapping.save();
            }
        }
    },
    createTopicLocally: function () {
        var self = Metamaps.Topic;

        var metacode = Metamaps.Metacodes.findWhere({
            name: Metamaps.Create.newTopic.metacode
        });

        var topic = new Metamaps.Backbone.Topic({
            name: Metamaps.Create.newTopic.name,
            metacode_id: metacode.id
        });
        Metamaps.Topics.add(topic);

        var mapping = new Metamaps.Backbone.Mapping({
            category: "Topic",
            xloc: Metamaps.Create.newTopic.x,
            yloc: Metamaps.Create.newTopic.y,
            topic_id: topic.cid
        });
        Metamaps.Mappings.add(mapping);

        //these can't happen until the value is retrieved, which happens in the line above
        Metamaps.Create.newTopic.hide();

        self.renderTopic(mapping, topic, true); // this function also includes the creation of the topic in the database
    },
    getTopicFromAutocomplete: function (id) {
        var self = Metamaps.Topic;

        Metamaps.Create.newTopic.hide();

        var topic = self.get(id);

        var mapping = new Metamaps.Backbone.Mapping({
            category: "Topic",
            xloc: Metamaps.Create.newTopic.x,
            yloc: Metamaps.Create.newTopic.y,
            topic_id: topic.id
        });
        Metamaps.Mappings.add(mapping);

        self.renderTopic(mapping, topic, false);
    }
}; // end Metamaps.Topic


/*
 *
 *   SYNAPSE
 *
 */
Metamaps.Synapse = {
    // this function is to retrieve a synapse JSON object from the database
    // @param id = the id of the synapse to retrieve
    get: function (id, callback) {
        // if the desired topic is not yet in the local topic repository, fetch it
        if (Metamaps.Synapses.get(id) == undefined) {
            if (!callback) {
                var e = $.ajax({
                    url: "/synapses/" + id + ".json",
                    async: false
                });
                Metamaps.Synapses.add($.parseJSON(e.responseText));
                return Metamaps.Synapses.get(id);
            } else {
                return $.ajax({
                    url: "/synapses/" + id + ".json",
                    success: function (data) {
                        Metamaps.Synapses.add(data);
                        callback(Metamaps.Synapses.get(id));
                    }
                });
            }
        } else {
            if (!callback) {
                return Metamaps.Synapses.get(id);
            } else {
                return callback(Metamaps.Synapses.get(id));
            }
        }
    },
    /*
     *
     *
     */
    renderSynapse: function (mapping, synapse, node1, node2, createNewInDB) {
        var self = Metamaps.Synapse;

        var edgeOnViz;

        var newedge = synapse.createEdge();

        Metamaps.Visualize.mGraph.graph.addAdjacence(node1, node2, newedge.data);
        edgeOnViz = Metamaps.Visualize.mGraph.graph.getAdjacence(node1.id, node2.id);
        synapse.set('edge', edgeOnViz);
        synapse.updateEdge(); // links the topic and the mapping to the node 

        Metamaps.Visualize.mGraph.fx.plotLine(edgeOnViz, Metamaps.Visualize.mGraph.canvas);
        Metamaps.Control.selectEdge(edgeOnViz);

        if (!Metamaps.Settings.sandbox && createNewInDB) {
            if (synapse.isNew()) {
                synapse.save(null, {
                    success: function (synapseModel, response) {
                        if (Metamaps.Active.Map) {
                            mapping.save({ synapse_id: synapseModel.id });
                        }
                    },
                    error: function (model, response) {
                        console.log('error saving synapse to database');
                    }
                });
            } else if (!synapse.isNew() && Metamaps.Active.Map) {
                mapping.save();
            }
        }
    },
    createSynapseLocally: function () {
        var self = Metamaps.Synapse,
            topic1,
            topic2,
            node1,
            node2,
            synapse,
            mapping;

        //for each node in this array we will create a synapse going to the position2 node.
        var synapsesToCreate = [];

        node2 = Metamaps.Visualize.mGraph.graph.getNode(Metamaps.Create.newSynapse.topic2id);
        topic2 = node2.getData('topic');

        var len = Metamaps.Selected.Nodes.length;
        if (len == 0) {
            synapsesToCreate[0] = Metamaps.Visualize.mGraph.graph.getNode(Metamaps.Create.newSynapse.topic1id);
        } else if (len > 0) {
            synapsesToCreate = Metamaps.Selected.Nodes;
        }

        for (var i = 0; i < synapsesToCreate.length; i++) {
            node1 = synapsesToCreate[i];
            topic1 = node1.getData('topic');
            synapse = new Metamaps.Backbone.Synapse({
                desc: Metamaps.Create.newSynapse.description,
                node1_id: topic1.isNew() ? topic1.cid : topic1.id,
                node2_id: topic2.isNew() ? topic2.cid : topic2.id,
            });
            Metamaps.Synapses.add(synapse);

            mapping = new Metamaps.Backbone.Mapping({
                category: "Synapse",
                synapse_id: synapse.cid
            });
            Metamaps.Mappings.add(mapping);

            // this function also includes the creation of the synapse in the database
            self.renderSynapse(mapping, synapse, node1, node2, true);
        } // for each in synapsesToCreate

        Metamaps.Create.newSynapse.hide();
    },
    getSynapseFromAutocomplete: function (id) {
        var self = Metamaps.Synapse,
            node1,
            node2;

        Metamaps.Create.newSynapse.hide();

        var synapse = self.get(id);

        var mapping = new Metamaps.Backbone.Mapping({
            category: "Synapse",
            synapse_id: synapse.id
        });
        Metamaps.Mappings.add(mapping);

        node1 = Metamaps.Visualize.mGraph.graph.getNode(Metamaps.Create.newSynapse.topic1id);
        node2 = Metamaps.Visualize.mGraph.graph.getNode(Metamaps.Create.newSynapse.topic2id);

        self.renderSynapse(mapping, synapse, node1, node2, false);
    }
}; // end Metamaps.Synapse


/*
 *
 *   MAP
 *
 */
Metamaps.Map = {
    init: function () {
        var self = Metamaps.Map;

        // prevent right clicks on the main canvas, so as to not get in the way of our right clicks
        $('#center-container').bind('contextmenu', function (e) {
            return false;
        });

        $('.sidebarFork').click(function () {
            self.fork();
        });

        Metamaps.GlobalUI.CreateMap.emptyForkMapForm = $('#fork_map').html();

        self.InfoBox.init();
        self.CheatSheet.init();
    },
    // this function is to retrieve a map JSON object from the database
    // @param id = the id of the map to retrieve
    get: function (id, callback) {
        // if the desired topic is not yet in the local topic repository, fetch it
        if (Metamaps.Maps.get(id) == undefined) {
            if (!callback) {
                var e = $.ajax({
                    url: "/maps/" + id + ".json",
                    async: false
                });
                Metamaps.Maps.add($.parseJSON(e.responseText));
                return Metamaps.Maps.get(id);
            } else {
                return $.ajax({
                    url: "/users/" + id + ".json",
                    success: function (data) {
                        Metamaps.Maps.add(data);
                        callback(Metamaps.Maps.get(id));
                    }
                });
            }
        } else {
            if (!callback) {
                return Metamaps.Maps.get(id);
            } else {
                return callback(Metamaps.Maps.get(id));
            }
        }
    },
    fork: function () {
        Metamaps.GlobalUI.openLightbox('forkmap');

        var nodes_data = "",
            synapses_data = "";
        var synapses_array = new Array();
        Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
            //don't add to the map if it was filtered out
            // TODO
            //if (categoryVisible[n.getData('metacode')] == false) {
            //    return;
            //}

            var x, y;
            if (n.pos.x && n.pos.y) {
                x = n.pos.x;
                y = n.pos.y;
            } else {
                var x = Math.cos(n.pos.theta) * n.pos.rho;
                var y = Math.sin(n.pos.theta) * n.pos.rho;
            }
            nodes_data += n.id + '/' + x + '/' + y + ',';
            n.eachAdjacency(function (adj) {
                synapses_array.push(adj.getData("synapses")[0].id); // TODO
            });
        });

        //get unique values only
        synapses_array = $.grep(synapses_array, function (value, key) {
            return $.inArray(value, synapses_array) === key;
        });

        synapses_data = synapses_array.join();
        nodes_data = nodes_data.slice(0, -1);

        Metamaps.GlobalUI.CreateMap.topicsToMap = nodes_data;
        Metamaps.GlobalUI.CreateMap.synapsesToMap = synapses_data;
    }
};


/*
 *
 *   CHEATSHEET
 *
 */
Metamaps.Map.CheatSheet = {
    init: function () {
        // tab the cheatsheet
        $('#cheatSheet').tabs().addClass("ui-tabs-vertical ui-helper-clearfix");
        $("#cheatSheet .ui-tabs-nav li").removeClass("ui-corner-top").addClass("ui-corner-left");
    }
}; // end Metamaps.Map.CheatSheet


/*
 *
 *   INFOBOX
 *
 */
Metamaps.Map.InfoBox = {
    isOpen: false,
    timeOut: null,
    changing: false,
    selectingPermission: false,
    init: function () {
        var self = Metamaps.Map.InfoBox;

        // because anyone who can edit the map can change the map title
        $('.mapInfoName .best_in_place_name').bind("ajax:success", function () {
            var name = $(this).html();
            $('.mapName').html(name);
            Metamaps.Active.Map.set('name', name);
        });

        $('.yourMap .mapPermission').click(self.onPermissionClick);

        $("div.index").hover(self.open, self.close);
    },
    open: function (event) {
        var self = Metamaps.GlobalUI.Account;

        clearTimeout(self.timeOut);
        if (!self.isOpen && !self.changing && event.target.className != "openCheatsheet openLightbox") {
            self.changing = true;
            $('.mapInfoBox').fadeIn(200, function () {
                self.changing = false;
                self.isOpen = true;
            });
        }
    },
    close: function () {
        var self = Metamaps.GlobalUI.Account;

        self.timeOut = setTimeout(function () {
            if (!self.changing) {
                self.changing = true;
                $('.mapInfoBox').fadeOut(200, function () {
                    self.changing = false;
                    self.isOpen = false;
                });
            }
        }, 500);
    },
    onPermissionClick: function () {
        var self = Metamaps.Map.InfoBox;

        if (!self.selectingPermission) {
            self.selectingPermission = true;
            $(this).addClass('minimize'); // this line flips the drop down arrow to a pull up arrow
            if ($(this).hasClass('commons')) {
                $(this).append('<ul class="permissionSelect"><li class="public"></li><li class="private"></li></ul>');
            } else if ($(this).hasClass('public')) {
                $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="private"></li></ul>');
            } else if ($(this).hasClass('private')) {
                $(this).append('<ul class="permissionSelect"><li class="commons"></li><li class="public"></li></ul>');
            }
            $('.mapPermission .permissionSelect li').click(self.selectPermission);
        } else {
            self.selectingPermission = false;
            $(this).removeClass('minimize'); // this line flips the pull up arrow to a drop down arrow
            $('.mapPermission .permissionSelect').remove();
        }
    },
    selectPermission: function () {
        var self = Metamaps.Map.InfoBox;

        self.selectingPermission = false;
        var permission = $(this).attr('class');
        Metamaps.Active.Map.save({
            permission: permission
        });
        $('.mapPermission').removeClass('commons public private minimize').addClass(permission);
        $('.mapPermission .permissionSelect').remove();
        event.stopPropagation();
    }
}; // end Metamaps.Map.InfoBox


/*
 *
 *   MAPPER
 *
 */
Metamaps.Mapper = {
    // this function is to retrieve a mapper JSON object from the database
    // @param id = the id of the mapper to retrieve
    get: function (id, callback) {
        // if the desired topic is not yet in the local topic repository, fetch it
        if (Metamaps.Mappers.get(id) == undefined) {
            if (!callback) {
                var e = $.ajax({
                    url: "/users/" + id + ".json",
                    async: false
                });
                Metamaps.Mappers.add($.parseJSON(e.responseText));
                return Metamaps.Mappers.get(id);
            } else {
                return $.ajax({
                    url: "/users/" + id + ".json",
                    success: function (data) {
                        Metamaps.Mappers.add(data);
                        callback(Metamaps.Mappers.get(id));
                    }
                });
            }
        } else {
            if (!callback) {
                return Metamaps.Mappers.get(id);
            } else {
                return callback(Metamaps.Mappers.get(id));
            }
        }
    },
}; // end Metamaps.Mapper