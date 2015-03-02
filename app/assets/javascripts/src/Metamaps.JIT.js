Metamaps.JIT = {
    events: {
        topicDrag: 'Metamaps:JIT:events:topicDrag', 
        newTopic: 'Metamaps:JIT:events:newTopic', 
        deleteTopic: 'Metamaps:JIT:events:deleteTopic', 
        removeTopic: 'Metamaps:JIT:events:removeTopic', 
        newSynapse: 'Metamaps:JIT:events:newSynapse', 
        deleteSynapse: 'Metamaps:JIT:events:deleteSynapse', 
        removeSynapse: 'Metamaps:JIT:events:removeSynapse', 
        pan: 'Metamaps:JIT:events:pan',
        zoom: 'Metamaps:JIT:events:zoom',
        animationDone: 'Metamaps:JIT:events:animationDone',
    },
    vizData: [], // contains the visualization-compatible graph
    /**
     * This method will bind the event handlers it is interested and initialize the class.
     */
    init: function () {
        var self = Metamaps.JIT;

        $(".zoomIn").click(self.zoomIn);
        $(".zoomOut").click(self.zoomOut);

        var zoomExtents = function (event) {
            self.zoomExtents(event, Metamaps.Visualize.mGraph.canvas);
        };
        $(".zoomExtents").click(zoomExtents);

        $(".takeScreenshot").click(Metamaps.Map.exportImage);

        self.topicDescImage = new Image();
        self.topicDescImage.src = '/assets/topic_description_signifier.png';

        self.topicLinkImage = new Image();
        self.topicLinkImage.src = '/assets/topic_link_signifier.png';
    },
    /**
     * convert our topic JSON into something JIT can use
     */
    convertModelsToJIT: function(topics, synapses) {
        var jitReady = [];

        var synapsesToRemove = [];
        var topic;
        var mapping;
        var node;
        var nodes = {};
        var existingEdge;
        var edge;
        var edges = [];

        topics.each(function (t) {
            node = t.createNode();
            nodes[node.id] = node;
        });
        synapses.each(function (s) {
            edge = s.createEdge();

            if (topics.get(s.get('node1_id')) === undefined || topics.get(s.get('node2_id')) === undefined) {
                // this means it's an invalid synapse
                synapsesToRemove.push(s);
            } 
            else if (nodes[edge.nodeFrom] && nodes[edge.nodeTo]) {

                existingEdge = _.findWhere(edges, {
                    nodeFrom: edge.nodeFrom,
                    nodeTo: edge.nodeTo
                }) ||
                    _.findWhere(edges, {
                        nodeFrom: edge.nodeTo,
                        nodeTo: edge.nodeFrom
                    });

                if (existingEdge) {
                    // for when you're dealing with multiple relationships between the same two topics
                    if (Metamaps.Active.Map) {
                        mapping = s.getMapping();
                        existingEdge.data['$mappingIDs'].push(mapping.id);
                    }
                    existingEdge.data['$synapseIDs'].push(s.id);
                } else {
                    // for when you're dealing with a topic that has relationships to many different nodes
                    nodes[edge.nodeFrom].adjacencies.push(edge);
                    edges.push(edge);
                }
            }
        });

        _.each(nodes, function (node) {
            jitReady.push(node);
        });

        return [jitReady, synapsesToRemove];
    },
    prepareVizData: function () {
        var self = Metamaps.JIT;
        var mapping;

        // reset/empty vizData
        self.vizData = [];
        Metamaps.Visualize.loadLater = false;

        var results = self.convertModelsToJIT(Metamaps.Topics, Metamaps.Synapses);

        self.vizData = results[0];

        // clean up the synapses array in case of any faulty data
        _.each(results[1], function (synapse) {
            mapping = synapse.getMapping();
            Metamaps.Synapses.remove(synapse);
            Metamaps.Mappings.remove(mapping);
        });

        if (self.vizData.length == 0) {
            Metamaps.Famous.viz.showInstructions();
            Metamaps.Visualize.loadLater = true;
        }
        else Metamaps.Famous.viz.hideInstructions();

        Metamaps.Visualize.render();
    }, // prepareVizData
    edgeRender: function (adj, canvas) {
        //get nodes cartesian coordinates 
        var pos = adj.nodeFrom.pos.getc(true);
        var posChild = adj.nodeTo.pos.getc(true);

        var synapse;
        if(adj.getData("displayIndex")) {
            synapse = adj.getData("synapses")[adj.getData("displayIndex")];
            if (!synapse) {
                delete adj.data.$displayIndex;
                synapse = adj.getData("synapses")[0];
            }
        }
        else {
            synapse = adj.getData("synapses")[0];
        }

        if (!synapse) return; // this means there are no corresponding synapses for
        // this edge, don't render it

        var directionCat = synapse.get("category");

        //label placement on edges
        if (canvas.denySelected) {
            var color = Metamaps.Settings.colors.synapses.normal;
            canvas.getCtx().fillStyle = canvas.getCtx().strokeStyle = color;
        }
        Metamaps.JIT.renderEdgeArrows($jit.Graph.Plot.edgeHelper, adj, synapse, canvas);

        //check for edge label in data  
        var desc = synapse.get("desc");

        var showDesc = adj.getData("showDesc");

        var drawSynapseCount = function (context, x, y, count) {
            /*
            circle size: 16x16px
            positioning: overlay and center on top right corner of synapse label - 8px left and 8px down
            color: #dab539
            border color: #424242
            border size: 1.5px
            font: DIN medium
            font-size: 14pt
            font-color: #424242
            */
            context.beginPath();
            context.arc(x, y, 8, 0, 2 * Math.PI, false);
            context.fillStyle = '#DAB539';
            context.strokeStyle = '#424242';
            context.lineWidth = 1.5;
            context.closePath();
            context.fill();
            context.stroke();

            // add the synapse count
            context.fillStyle = '#424242';
            context.textAlign = 'center';
            context.font = '14px din-medium';

            context.fillText(count, x, y + 5);
        };

        if (!canvas.denySelected && desc != "" && showDesc) {
            // '&amp;' to '&'
            desc = Metamaps.Util.decodeEntities(desc);

            //now adjust the label placement 
            var ctx = canvas.getCtx();
            ctx.font = 'bold 14px arial';
            ctx.fillStyle = '#FFF';
            ctx.textBaseline = 'alphabetic';

            var arrayOfLabelLines = Metamaps.Util.splitLine(desc, 30).split('\n');
            var index, lineWidths = [];
            for (index = 0; index < arrayOfLabelLines.length; ++index) {
                lineWidths.push(ctx.measureText(arrayOfLabelLines[index]).width)
            }
            var width = Math.max.apply(null, lineWidths) + 16;
            var height = (16 * arrayOfLabelLines.length) + 8;

            var x = (pos.x + posChild.x - width) / 2;
            var y = ((pos.y + posChild.y) / 2) - height / 2;

            var radius = 5;

            //render background
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();

            // get number of synapses
            var synapseNum = adj.getData("synapses").length;

            //render text
            ctx.fillStyle = '#424242';
            ctx.textAlign = 'center';
            for (index = 0; index < arrayOfLabelLines.length; ++index) {
                ctx.fillText(arrayOfLabelLines[index], x + (width / 2), y + 18 + (16 * index));
            }

            if (synapseNum > 1) {
                drawSynapseCount(ctx, x + width, y, synapseNum);
            }
        }
        else if (!canvas.denySelected && showDesc) {
            // get number of synapses
            var synapseNum = adj.getData("synapses").length;

            if (synapseNum > 1) {
                var ctx = canvas.getCtx();
                var x = (pos.x + posChild.x) / 2;
                var y = (pos.y + posChild.y) / 2;
                drawSynapseCount(ctx, x, y, synapseNum);
            }
        }

    }, // edgeRender
    ForceDirected: {
        animateSavedLayout: {
            modes: ['linear'],
            transition: $jit.Trans.Quad.easeInOut,
            duration: 800,
            onComplete: function () {
                Metamaps.Visualize.mGraph.busy = false;
                $(document).trigger(Metamaps.JIT.events.animationDone);
            }
        },
        animateFDLayout: {
            modes: ['linear'],
            transition: $jit.Trans.Elastic.easeOut,
            duration: 800,
            onComplete: function () {
                Metamaps.Visualize.mGraph.busy = false;
            }
        },
        graphSettings: {
            //id of the visualization container
            injectInto: 'infovis',
            //Enable zooming and panning
            //by scrolling and DnD
            Navigation: {
                enable: true,
                //Enable panning events only if we're dragging the empty
                //canvas (and not a node).
                panning: 'avoid nodes',
                zooming: 28 //zoom speed. higher is more sensible
            },
            //background: {
            //    type: 'Metamaps'
            //},
            //NodeStyles: {  
            //  enable: true,  
            //  type: 'Native',  
            //  stylesHover: {  
            //    dim: 30  
            //  },  
            //  duration: 300  
            //},
            // Change node and edge styles such as
            // color and width.
            // These properties are also set per node
            // with dollar prefixed data-properties in the
            // JSON structure.
            Node: {
                overridable: true,
                color: '#2D6A5D',
                type: 'customNode',
                dim: 25
            },
            Edge: {
                overridable: true,
                color: Metamaps.Settings.colors.synapses.normal,
                type: 'customEdge',
                lineWidth: 2,
                alpha: 1
            },
            //Native canvas text styling
            Label: {
                type: 'Native', //Native or HTML
                size: 20,
                family: 'arial',
                textBaseline: 'alphabetic',
                color: Metamaps.Settings.colors.labels.text
            },
            //Add Tips
            Tips: {
                enable: false,
                onShow: function (tip, node) {}
            },
            // Add node events
            Events: {
                enable: true,
                enableForEdges: true,
                onMouseMove: function (node, eventInfo, e) {
                    Metamaps.JIT.onMouseMoveHandler(node, eventInfo, e);
                    //console.log('called mouse move handler');
                },
                //Update node positions when dragged
                onDragMove: function (node, eventInfo, e) {
                    Metamaps.JIT.onDragMoveTopicHandler(node, eventInfo, e);
                    //console.log('called drag move handler');
                },
                onDragEnd: function (node, eventInfo, e) {
                    Metamaps.JIT.onDragEndTopicHandler(node, eventInfo, e, false);
                    //console.log('called drag end handler');
                },
                onDragCancel: function (node, eventInfo, e) {
                    Metamaps.JIT.onDragCancelHandler(node, eventInfo, e, false);
                },
                //Implement the same handler for touchscreens
                onTouchStart: function (node, eventInfo, e) {
                    //$jit.util.event.stop(e); //stop default touchmove event
                    //Metamaps.Visualize.mGraph.events.onMouseDown(e, null, eventInfo);
                    Metamaps.Visualize.mGraph.events.touched = true;
                    Metamaps.Touch.touchPos = eventInfo.getPos();
                    var canvas = Metamaps.Visualize.mGraph.canvas,
                        ox = canvas.translateOffsetX;
                    oy = canvas.translateOffsetY,
                    sx = canvas.scaleOffsetX,
                    sy = canvas.scaleOffsetY;
                    Metamaps.Touch.touchPos.x *= sx;
                    Metamaps.Touch.touchPos.y *= sy;
                    Metamaps.Touch.touchPos.x += ox;
                    Metamaps.Touch.touchPos.y += oy;

                    touchDragNode = node;
                },
                //Implement the same handler for touchscreens
                onTouchMove: function (node, eventInfo, e) {
                    if (Metamaps.Touch.touchDragNode) Metamaps.JIT.onDragMoveTopicHandler(Metamaps.Touch.touchDragNode, eventInfo, e);
                    else {
                        Metamaps.JIT.touchPanZoomHandler(eventInfo, e);
                    }
                },
                //Implement the same handler for touchscreens
                onTouchEnd: function (node, eventInfo, e) {

                },
                //Implement the same handler for touchscreens
                onTouchCancel: function (node, eventInfo, e) {

                },
                //Add also a click handler to nodes
                onClick: function (node, eventInfo, e) {

                    // remove the rightclickmenu
                    $('.rightclickmenu').remove();

                    if (Metamaps.Mouse.boxStartCoordinates) {
                        if(e.ctrlKey){
                            Metamaps.Visualize.mGraph.busy = false;
                            Metamaps.Mouse.boxEndCoordinates = eventInfo.getPos();

                            var bS = Metamaps.Mouse.boxStartCoordinates;
                            var bE = Metamaps.Mouse.boxEndCoordinates;
                            if (Math.abs(bS.x - bE.x) > 20 && Math.abs(bS.y - bE.y) > 20) {
                                Metamaps.JIT.zoomToBox(e);
                                return;
                            }
                            else {
                                Metamaps.Mouse.boxStartCoordinates = null;
                                Metamaps.Mouse.boxEndCoordinates = null;
                            }
                            //console.log('called zoom to box');
                        }
                        
                        if (e.shiftKey) {
                            Metamaps.Visualize.mGraph.busy = false;
                            Metamaps.Mouse.boxEndCoordinates = eventInfo.getPos();
                            Metamaps.JIT.selectWithBox(e);
                            //console.log('called select with box');
                            return;
                        };
                    }

                    if (e.target.id != "infovis-canvas") return false;

                    //clicking on a edge, node, or clicking on blank part of canvas?
                    if (node.nodeFrom) {
                        Metamaps.JIT.selectEdgeOnClickHandler(node, e);
                        //console.log('called selectEdgeOnClickHandler');
                    } else if (node && !node.nodeFrom) {
                        Metamaps.JIT.selectNodeOnClickHandler(node, e);
                        //console.log('called selectNodeOnClickHandler');
                    } else {
                        Metamaps.JIT.canvasClickHandler(eventInfo.getPos(), e);
                        //console.log('called canvasClickHandler');
                    } //if
                },
                //Add also a click handler to nodes
                onRightClick: function (node, eventInfo, e) {

                    // remove the rightclickmenu
                    $('.rightclickmenu').remove();

                    if (Metamaps.Mouse.boxStartCoordinates) {
                        Metamaps.Visualize.mGraph.busy = false;
                        Metamaps.Mouse.boxEndCoordinates = eventInfo.getPos();
                        Metamaps.JIT.selectWithBox(e);
                        return;
                    }

                    if (e.target.id != "infovis-canvas") return false;

                    //clicking on a edge, node, or clicking on blank part of canvas?
                    if (node.nodeFrom) {
                        Metamaps.JIT.selectEdgeOnRightClickHandler(node, e);
                    } else if (node && !node.nodeFrom) {
                        Metamaps.JIT.selectNodeOnRightClickHandler(node, e);
                    } else {
                        //console.log('right clicked on open space');
                    } 
                }
            },
            //Number of iterations for the FD algorithm
            iterations: 200,
            //Edge length
            levelDistance: 200,
        },
        nodeSettings: {
            'customNode': {
                'render': function (node, canvas) {
                    var pos = node.pos.getc(true),
                        dim = node.getData('dim'),
                        topic = node.getData('topic'),
                        metacode = topic ? topic.getMetacode() : false,
                        ctx = canvas.getCtx();

                    // if the topic is selected draw a circle around it
                    if (!canvas.denySelected && node.selected) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, dim + 3, 0, 2 * Math.PI, false);
                        ctx.strokeStyle = Metamaps.Settings.colors.topics.selected;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }

                    if (!metacode ||
                        !metacode.get('image') ||
                        !metacode.get('image').complete ||
                        (typeof metacode.get('image').naturalWidth !== "undefined" &&
                            metacode.get('image').naturalWidth === 0)) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, dim, 0, 2 * Math.PI, false);
                        ctx.fillStyle = '#B6B2FD';
                        ctx.fill();
                    } else {
                        ctx.drawImage(metacode.get('image'), pos.x - dim, pos.y - dim, dim * 2, dim * 2);
                    }

                    // if the topic has a link, draw a small image to indicate that
                    var hasLink = topic && topic.get('link') !== "" && topic.get('link') !== null;
                    var linkImage = Metamaps.JIT.topicLinkImage;
                    var linkImageLoaded = linkImage.complete ||
                        (typeof linkImage.naturalWidth !== "undefined" &&
                            linkImage.naturalWidth !== 0)
                    if (hasLink && linkImageLoaded) {
                        ctx.drawImage(linkImage, pos.x - dim - 8, pos.y - dim - 8, 16, 16);
                    }

                    // if the topic has a desc, draw a small image to indicate that
                    var hasDesc = topic && topic.get('desc') !== "" && topic.get('desc') !== null;
                    var descImage = Metamaps.JIT.topicDescImage;
                    var descImageLoaded = descImage.complete ||
                        (typeof descImage.naturalWidth !== "undefined" &&
                            descImage.naturalWidth !== 0)
                    if (hasDesc && descImageLoaded) {
                        ctx.drawImage(descImage, pos.x + dim - 8, pos.y - dim - 8, 16, 16);
                    }
                },
                'contains': function (node, pos) {
                    var npos = node.pos.getc(true),
                        dim = node.getData('dim'),
                        arrayOfLabelLines = Metamaps.Util.splitLine(node.name, 30).split('\n'),
                        ctx = Metamaps.Visualize.mGraph.canvas.getCtx();

                    var height = 25 * arrayOfLabelLines.length;

                    var index, lineWidths = [];
                    for (index = 0; index < arrayOfLabelLines.length; ++index) {
                        lineWidths.push(ctx.measureText(arrayOfLabelLines[index]).width)
                    }
                    var width = Math.max.apply(null, lineWidths) + 8;
                    var labely = npos.y + node.getData("height") + 5 + height / 2;

                    var overLabel = this.nodeHelper.rectangle.contains({
                        x: npos.x,
                        y: labely
                    }, pos, width, height);

                    return this.nodeHelper.circle.contains(npos, pos, dim) || overLabel;
                }
            }
        },
        edgeSettings: {
            'customEdge': {
                'render': function (adj, canvas) {
                    Metamaps.JIT.edgeRender(adj, canvas)
                },
                'contains': function (adj, pos) {
                    var from = adj.nodeFrom.pos.getc(),
                        to = adj.nodeTo.pos.getc();
                    
                    // this fixes an issue where when edges are perfectly horizontal or perfectly vertical
                    // it becomes incredibly difficult to hover over them
                    if (-1 < pos.x && pos.x < 1) pos.x = 0;
                    if (-1 < pos.y && pos.y < 1) pos.y = 0;
                    
                    return $jit.Graph.Plot.edgeHelper.line.contains(from, to, pos, adj.Edge.epsilon + 5);
                }
            }
        }
    }, // ForceDirected
    ForceDirected3D: {
        animate: {
            modes: ['linear'],
            transition: $jit.Trans.Elastic.easeOut,
            duration: 2500,
            onComplete: function () {
                Metamaps.Visualize.mGraph.busy = false;
            }
        },
        graphSettings: {
            //id of the visualization container
            injectInto: 'infovis',
            type: '3D',
            Scene: {
                Lighting: {
                    enable: false,
                    ambient: [0.5, 0.5, 0.5],
                    directional: {
                        direction: {
                            x: 1,
                            y: 0,
                            z: -1
                        },
                        color: [0.9, 0.9, 0.9]
                    }
                }
            },
            //Enable zooming and panning
            //by scrolling and DnD
            Navigation: {
                enable: false,
                //Enable panning events only if we're dragging the empty
                //canvas (and not a node).
                panning: 'avoid nodes',
                zooming: 10 //zoom speed. higher is more sensible
            },
            // Change node and edge styles such as
            // color and width.
            // These properties are also set per node
            // with dollar prefixed data-properties in the
            // JSON structure.
            Node: {
                overridable: true,
                type: 'sphere',
                dim: 15,
                color: '#ffffff'
            },
            Edge: {
                overridable: false,
                type: 'tube',
                color: '#111',
                lineWidth: 3
            },
            //Native canvas text styling
            Label: {
                type: 'HTML', //Native or HTML
                size: 10,
                style: 'bold'
            },
            // Add node events
            Events: {
                enable: true,
                type: 'Native',
                i: 0,
                onMouseMove: function (node, eventInfo, e) {
                    //if(this.i++ % 3) return;
                    var pos = eventInfo.getPos();
                    Metamaps.Visualize.cameraPosition.x += (pos.x - Metamaps.Visualize.cameraPosition.x) * 0.5;
                    Metamaps.Visualize.cameraPosition.y += (-pos.y - Metamaps.Visualize.cameraPosition.y) * 0.5;
                    Metamaps.Visualize.mGraph.plot();
                },
                onMouseWheel: function (delta) {
                    Metamaps.Visualize.cameraPosition.z += -delta * 20;
                    Metamaps.Visualize.mGraph.plot();
                },
                onClick: function () {}
            },
            //Number of iterations for the FD algorithm
            iterations: 200,
            //Edge length
            levelDistance: 100
        },
        nodeSettings: {

        },
        edgeSettings: {

        }
    }, // ForceDirected3D
    RGraph: {
        animate: {
            modes: ['polar'],
            duration: 800,
            onComplete: function () {
                Metamaps.Visualize.mGraph.busy = false;
            }
        },
        // this will just be used to patch the ForceDirected graphsettings with the few things which actually differ
        background: {
                //type: 'Metamaps',
                levelDistance: 200,
                numberOfCircles: 4,
                CanvasStyles: {
                    strokeStyle: '#333',
                    lineWidth: 1.5
                }
        },
        levelDistance: 200
    },
    onMouseEnter: function (edge) {
        var filtered = edge.getData('alpha') === 0;

        // don't do anything if the edge is filtered
        // or if the canvas is animating        
        if (filtered || Metamaps.Visualize.mGraph.busy) return; 

        $('canvas').css('cursor', 'pointer');
        var edgeIsSelected = Metamaps.Selected.Edges.indexOf(edge);
        //following if statement only executes if the edge being hovered over is not selected
        if (edgeIsSelected == -1) {
            edge.setData('showDesc', true, 'current');
        }

        edge.setDataset('end', {
            lineWidth: 4
        });
        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['edge-property:lineWidth'],
            duration: 100
        });
        Metamaps.Visualize.mGraph.plot();
    }, // onMouseEnter
    onMouseLeave: function (edge) {
        if (edge.getData('alpha') === 0) return; // don't do anything if the edge is filtered
        $('canvas').css('cursor', 'default');
        var edgeIsSelected = Metamaps.Selected.Edges.indexOf(edge);
        //following if statement only executes if the edge being hovered over is not selected
        if (edgeIsSelected == -1) {
            edge.setData('showDesc', false, 'current');
        }

        edge.setDataset('end', {
            lineWidth: 2
        });
        Metamaps.Visualize.mGraph.fx.animate({
            modes: ['edge-property:lineWidth'],
            duration: 100
        });
        Metamaps.Visualize.mGraph.plot();
    }, // onMouseLeave
    onMouseMoveHandler: function (node, eventInfo, e) {

        var self = Metamaps.JIT;

        if (Metamaps.Visualize.mGraph.busy) return;

        var node = eventInfo.getNode();
        var edge = eventInfo.getEdge();

        //if we're on top of a node object, act like there aren't edges under it
        if (node != false) {
            if (Metamaps.Mouse.edgeHoveringOver) {
                self.onMouseLeave(Metamaps.Mouse.edgeHoveringOver);
            }
            $('canvas').css('cursor', 'pointer');
            return;
        }

        if (edge == false && Metamaps.Mouse.edgeHoveringOver != false) {
            //mouse not on an edge, but we were on an edge previously
            self.onMouseLeave(Metamaps.Mouse.edgeHoveringOver);
        } else if (edge != false && Metamaps.Mouse.edgeHoveringOver == false) {
            //mouse is on an edge, but there isn't a stored edge
            self.onMouseEnter(edge);
        } else if (edge != false && Metamaps.Mouse.edgeHoveringOver != edge) {
            //mouse is on an edge, but a different edge is stored
            self.onMouseLeave(Metamaps.Mouse.edgeHoveringOver)
            self.onMouseEnter(edge);
        }

        //could be false
        Metamaps.Mouse.edgeHoveringOver = edge;

        if (!node && !edge) {
            $('canvas').css('cursor', 'default');
        }
    }, // onMouseMoveHandler
    enterKeyHandler: function () {
        var creatingMap = Metamaps.GlobalUI.lightbox;
        if (creatingMap === "newmap" || creatingMap === "forkmap") {
            Metamaps.GlobalUI.CreateMap.submit();
        }
        // this is to submit new topic creation
        else if (Metamaps.Create.newTopic.beingCreated) {
            Metamaps.Topic.createTopicLocally();
        }
        // to submit new synapse creation 
        else if (Metamaps.Create.newSynapse.beingCreated) {
            Metamaps.Synapse.createSynapseLocally();
        }
    }, //enterKeyHandler
    escKeyHandler: function () {
        Metamaps.Control.deselectAllEdges();
        Metamaps.Control.deselectAllNodes();
    }, //escKeyHandler
    touchPanZoomHandler: function (eventInfo, e) {
        if (e.touches.length == 1) {
            var thispos = Metamaps.Touch.touchPos,
                currentPos = eventInfo.getPos(),
                canvas = Metamaps.Visualize.mGraph.canvas,
                ox = canvas.translateOffsetX,
                oy = canvas.translateOffsetY,
                sx = canvas.scaleOffsetX,
                sy = canvas.scaleOffsetY;
            currentPos.x *= sx;
            currentPos.y *= sy;
            currentPos.x += ox;
            currentPos.y += oy;
            //var x = currentPos.x - thispos.x,
            //    y = currentPos.y - thispos.y;
            var x = currentPos.x - thispos.x,
                y = currentPos.y - thispos.y;
            Metamaps.Touch.touchPos = currentPos;
            Metamaps.Visualize.mGraph.canvas.translate(x * 1 / sx, y * 1 / sy);
        } else if (e.touches.length == 2) {
            var touch1 = e.touches[0];
            var touch2 = e.touches[1];

            var dist = Metamaps.Util.getDistance({
                x: touch1.clientX,
                y: touch1.clientY
            }, {
                x: touch2.clientX,
                y: touch2.clientY
            });

            if (!lastDist) {
                lastDist = dist;
            }

            var scale = dist / lastDist;

            if (8 >= Metamaps.Visualize.mGraph.canvas.scaleOffsetX * scale && Metamaps.Visualize.mGraph.canvas.scaleOffsetX * scale >= 1) {
                Metamaps.Visualize.mGraph.canvas.scale(scale, scale);
            }
            if (Metamaps.Visualize.mGraph.canvas.scaleOffsetX < 0.5) {
                Metamaps.Visualize.mGraph.canvas.viz.labels.hideLabels(true);
            } else if (Metamaps.Visualize.mGraph.canvas.scaleOffsetX > 0.5) {
                Metamaps.Visualize.mGraph.canvas.viz.labels.hideLabels(false);
            }
            lastDist = dist;
        }

    }, // touchPanZoomHandler
    onDragMoveTopicHandler: function (node, eventInfo, e) {

        var self = Metamaps.JIT;

        // this is used to send nodes that are moving to 
        // other realtime collaborators on the same map
        var positionsToSend = {};
        var topic;

        var authorized = Metamaps.Active.Map && Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        if (node && !node.nodeFrom) {
            var pos = eventInfo.getPos();
            // if it's a left click, or a touch, move the node
            if (e.touches || (e.button == 0 && !e.altKey && !e.ctrlKey && !e.shiftKey && (e.buttons == 0 || e.buttons == 1 || e.buttons == undefined))) {
                //if the node dragged isn't already selected, select it
                var whatToDo = self.handleSelectionBeforeDragging(node, e);
                if (node.pos.rho || node.pos.rho === 0) {
                    // this means we're in topic view
                    var rho = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
                    var theta = Math.atan2(pos.y, pos.x);
                    node.pos.setp(theta, rho);
                } else if (whatToDo == 'only-drag-this-one') {
                    node.pos.setc(pos.x, pos.y);

                    if (Metamaps.Active.Map) {
                        topic = node.getData('topic');
                        // we use the topic ID not the node id
                        // because we can't depend on the node id
                        // to be the same as on other collaborators
                        // maps
                        positionsToSend[topic.id] = pos;
                        $(document).trigger(Metamaps.JIT.events.topicDrag, [positionsToSend]);
                    }
                } else {
                    var len = Metamaps.Selected.Nodes.length;

                    //first define offset for each node
                    var xOffset = new Array();
                    var yOffset = new Array();
                    for (var i = 0; i < len; i += 1) {
                        var n = Metamaps.Selected.Nodes[i];
                        xOffset[i] = n.pos.x - node.pos.x;
                        yOffset[i] = n.pos.y - node.pos.y;
                    } //for

                    for (var i = 0; i < len; i += 1) {
                        var n = Metamaps.Selected.Nodes[i];
                        var x = pos.x + xOffset[i];
                        var y = pos.y + yOffset[i];
                        n.pos.setc(x, y);

                        if (Metamaps.Active.Map) {
                            topic = n.getData('topic');
                            // we use the topic ID not the node id
                            // because we can't depend on the node id
                            // to be the same as on other collaborators
                            // maps
                            positionsToSend[topic.id] = n.pos;
                        }
                    } //for

                    if (Metamaps.Active.Map) {
                        $(document).trigger(Metamaps.JIT.events.topicDrag, [positionsToSend]);
                    }
                } //if

                if (whatToDo == 'deselect') {
                    Metamaps.Control.deselectNode(node);
                }
                Metamaps.Visualize.mGraph.plot();
            }
            // if it's a right click or holding down alt, start synapse creation  ->third option is for firefox
            else if ((e.button == 2 || (e.button == 0 && e.altKey) || e.buttons == 2) && authorized) {
                if (tempInit == false) {
                    tempNode = node;
                    tempInit = true;

                    Metamaps.Create.newTopic.hide();
                    Metamaps.Create.newSynapse.hide();
                    // set the draw synapse start positions
                    var l = Metamaps.Selected.Nodes.length;
                    if (l > 0) {
                        for (var i = l - 1; i >= 0; i -= 1) {
                            var n = Metamaps.Selected.Nodes[i];
                            Metamaps.Mouse.synapseStartCoordinates.push({
                                x: n.pos.getc().x,
                                y: n.pos.getc().y
                            });
                        }
                    } else {
                        Metamaps.Mouse.synapseStartCoordinates = [{
                            x: tempNode.pos.getc().x,
                            y: tempNode.pos.getc().y
                        }];
                    }
                    Metamaps.Mouse.synapseEndCoordinates = {
                        x: pos.x,
                        y: pos.y
                    };
                }
                //
                temp = eventInfo.getNode();
                if (temp != false && temp.id != node.id && Metamaps.Selected.Nodes.indexOf(temp) == -1) { // this means a Node has been returned
                    tempNode2 = temp;
                    
                    Metamaps.Mouse.synapseEndCoordinates = {
                        x: tempNode2.pos.getc().x,
                        y: tempNode2.pos.getc().y
                    };

                    // before making the highlighted one bigger, make sure all the others are regular size
                    Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                        n.setData('dim', 25, 'current');
                    });
                    temp.setData('dim', 35, 'current');
                    Metamaps.Visualize.mGraph.plot();
                } else if (!temp) {
                    tempNode2 = null;
                    Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
                        n.setData('dim', 25, 'current');
                    });
                    //pop up node creation :)
                    var myX = e.clientX - 110;
                    var myY = e.clientY - 30;
                    $('#new_topic').css('left', myX + "px");
                    $('#new_topic').css('top', myY + "px");
                    Metamaps.Create.newTopic.x = eventInfo.getPos().x;
                    Metamaps.Create.newTopic.y = eventInfo.getPos().y;
                    Metamaps.Visualize.mGraph.plot();

                    Metamaps.Mouse.synapseEndCoordinates = {
                        x: pos.x,
                        y: pos.y
                    };
                }
            }
            else if ((e.button == 2 || (e.button == 0 && e.altKey) || e.buttons == 2) && Metamaps.Active.Topic) {
                Metamaps.GlobalUI.notifyUser("Cannot create in Topic view.");
            }
            else if ((e.button == 2 || (e.button == 0 && e.altKey) || e.buttons == 2) && !authorized) {
                Metamaps.GlobalUI.notifyUser("Cannot edit Public map.");
            }
        }
    }, // onDragMoveTopicHandler
    onDragCancelHandler: function (node, eventInfo, e) {
        tempNode = null;
        if (tempNode2) tempNode2.setData('dim', 25, 'current');
        tempNode2 = null;
        tempInit = false;
        // reset the draw synapse positions to false
        Metamaps.Mouse.synapseStartCoordinates = [];
        Metamaps.Mouse.synapseEndCoordinates = null;
        Metamaps.Visualize.mGraph.plot();
    }, // onDragCancelHandler
    onDragEndTopicHandler: function (node, eventInfo, e) {
        var midpoint = {}, pixelPos, mapping;

        if (tempInit && tempNode2 == null) {
            // this means you want to add a new topic, and then a synapse
            Metamaps.Create.newTopic.addSynapse = true;
            Metamaps.Create.newTopic.open();
        } else if (tempInit && tempNode2 != null) {
            // this means you want to create a synapse between two existing topics
            Metamaps.Create.newTopic.addSynapse = false;
            Metamaps.Create.newSynapse.topic1id = tempNode.getData('topic').id;
            Metamaps.Create.newSynapse.topic2id = tempNode2.getData('topic').id;
            tempNode2.setData('dim', 25, 'current');
            Metamaps.Visualize.mGraph.plot();
            midpoint.x = tempNode.pos.getc().x + (tempNode2.pos.getc().x - tempNode.pos.getc().x) / 2;
            midpoint.y = tempNode.pos.getc().y + (tempNode2.pos.getc().y - tempNode.pos.getc().y) / 2;
            pixelPos = Metamaps.Util.coordsToPixels(midpoint);
            $('#new_synapse').css('left', pixelPos.x + "px");
            $('#new_synapse').css('top', pixelPos.y + "px");
            Metamaps.Create.newSynapse.open();
            tempNode = null;
            tempNode2 = null;
            tempInit = false;
        } else if (!tempInit && node && !node.nodeFrom) {
            // this means you dragged an existing node, autosave that to the database

            // check whether to save mappings
            var checkWhetherToSave = function() {
                var map = Metamaps.Active.Map;

                if (!map) return false;

                var mapper = Metamaps.Active.Mapper;
                // this case
                // covers when it is a public map owned by you
                // and also when it's a private map
                var activeMappersMap = map.authorizePermissionChange(mapper); 
                var commonsMap = map.get('permission') === 'commons';
                var realtimeOn = Metamaps.Realtime.status;

                // don't save if commons map, and you have realtime off, 
                // even if you're map creator
                return map && mapper && ((commonsMap && realtimeOn) || (activeMappersMap && !commonsMap));
            }

            if (checkWhetherToSave()) {
                mapping = node.getData('mapping');
                mapping.save({
                    xloc: node.getPos().x,
                    yloc: node.getPos().y
                });
                // also save any other selected nodes that also got dragged along
                var l = Metamaps.Selected.Nodes.length;
                for (var i = l - 1; i >= 0; i -= 1) {
                    var n = Metamaps.Selected.Nodes[i];
                    if (n !== node) {
                        mapping = n.getData('mapping');
                        mapping.save({
                            xloc: n.getPos().x,
                            yloc: n.getPos().y
                        });
                    }
                };
            }
        }
    }, //onDragEndTopicHandler
    canvasClickHandler: function (canvasLoc, e) {
        //grab the location and timestamp of the click 
        var storedTime = Metamaps.Mouse.lastCanvasClick;
        var now = Date.now(); //not compatible with IE8 FYI 
        Metamaps.Mouse.lastCanvasClick = now;

        var authorized = Metamaps.Active.Map && Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        if (now - storedTime < Metamaps.Mouse.DOUBLE_CLICK_TOLERANCE && !Metamaps.Mouse.didPan) {
            if (Metamaps.Active.Map && !authorized) {
                Metamaps.GlobalUI.notifyUser("Cannot edit Public map.");
                return;
            }
            else if (Metamaps.Active.Topic) {
                Metamaps.GlobalUI.notifyUser("Cannot create in Topic view.");
                return;
            }
            // DOUBLE CLICK
            //pop up node creation :) 
            Metamaps.Create.newTopic.addSynapse = false;
            Metamaps.Create.newTopic.x = canvasLoc.x;
            Metamaps.Create.newTopic.y = canvasLoc.y;
            $('#new_topic').css('left', e.clientX + "px");
            $('#new_topic').css('top', e.clientY + "px");
            Metamaps.Create.newTopic.open();
        } else if (!Metamaps.Mouse.didPan) {
            // SINGLE CLICK, no pan
            Metamaps.Filter.close();
            Metamaps.TopicCard.hideCard();
            Metamaps.SynapseCard.hideCard();
            Metamaps.Create.newTopic.hide();
            if ($(Metamaps.Create.newSynapse).is(":visible")) {
              //this function also hides the newSynapse form
              Metamaps.Create.newSynapse.$('#synapse_desc').val() == "") {
            }//if

            $('.rightclickmenu').remove();
            // reset the draw synapse positions to false
            Metamaps.Mouse.synapseStartCoordinates = [];
            Metamaps.Mouse.synapseEndCoordinates = null;
            tempInit = false;
            tempNode = null;
            tempNode2 = null;
            if (!e.ctrlKey && !e.shiftKey) {
                Metamaps.Control.deselectAllEdges();
                Metamaps.Control.deselectAllNodes();
            }
        }
    }, //canvasClickHandler 
    nodeDoubleClickHandler: function (node, e) {

        Metamaps.TopicCard.showCard(node);

    }, // nodeDoubleClickHandler
    edgeDoubleClickHandler: function (adj, e) {

        Metamaps.SynapseCard.showCard(adj, e);

    }, // nodeDoubleClickHandler
    nodeWasDoubleClicked: function () {
        //grab the timestamp of the click 
        var storedTime = Metamaps.Mouse.lastNodeClick;
        var now = Date.now(); //not compatible with IE8 FYI 
        Metamaps.Mouse.lastNodeClick = now;

        if (now - storedTime < Metamaps.Mouse.DOUBLE_CLICK_TOLERANCE) {
            return true;
        } else {
            return false;
        }
    }, //nodeWasDoubleClicked;
    handleSelectionBeforeDragging: function (node, e) {
        // four cases:
        // 1 nothing is selected, so pretend you aren't selecting
        // 2 others are selected only and shift, so additionally select this one
        // 3 others are selected only, no shift: drag only this one
        // 4 this node and others were selected, so drag them (just return false)
        //return value: deselect node again after?
        if (Metamaps.Selected.Nodes.length == 0) {
		     return 'only-drag-this-one';
        }
        if (Metamaps.Selected.Nodes.indexOf(node) == -1) {
            if (e.shiftKey) {
                Metamaps.Control.selectNode(node,e);
                return 'nothing';
            } else {
                return 'only-drag-this-one';
            }
        }
        return 'nothing'; //case 4?
    }, //  handleSelectionBeforeDragging
    selectWithBox: function (e) {

        var sX = Metamaps.Mouse.boxStartCoordinates.x,
            sY = Metamaps.Mouse.boxStartCoordinates.y,
            eX = Metamaps.Mouse.boxEndCoordinates.x,
            eY = Metamaps.Mouse.boxEndCoordinates.y;
		
		if(!e.shiftKey){
			Metamaps.Control.deselectAllNodes();
			Metamaps.Control.deselectAllEdges();
		}

		//select all nodes that are within the box
        Metamaps.Visualize.mGraph.graph.eachNode(function (n) {
            var x = n.pos.x,
                y = n.pos.y;

            if ((sX < x && x < eX && sY < y && y < eY) || (sX > x && x > eX && sY > y && y > eY) || (sX > x && x > eX && sY < y && y < eY) || (sX < x && x < eX && sY > y && y > eY)) {
                if(e.shiftKey){
					if(n.selected){
						Metamaps.Control.deselectNode(n);
					}
					else{
						Metamaps.Control.selectNode(n,e);
					}
				}
				else{
					Metamaps.Control.selectNode(n,e);
				}
            }
        });

		//Convert selection box coordinates to traditional coordinates (+,+) in upper right
		sY = -1 * sY;
		eY = -1 * eY

        var edgesToToggle = [];
        Metamaps.Synapses.each(function(synapse) {
            var e = synapse.get('edge');
            if (edgesToToggle.indexOf(e) === -1) {
                edgesToToggle.push(e);
            }
        });
		edgesToToggle.forEach(function(edge) {
			var fromNodeX = edge.nodeFrom.pos.x;
			var fromNodeY = -1 * edge.nodeFrom.pos.y;
			var toNodeX = edge.nodeTo.pos.x;
			var toNodeY = -1 * edge.nodeTo.pos.y;

            var maxX = fromNodeX;
			var maxY = fromNodeY;
			var minX = fromNodeX;
			var minY = fromNodeY;
			
			//Correct maxX, MaxY values
			(toNodeX > maxX) ? (maxX = toNodeX):(minX = toNodeX);
			(toNodeY > maxY) ? (maxY = toNodeY):(minY = toNodeY);
			
			var maxBoxX = sX;
			var maxBoxY = sY;
			var minBoxX = sX;
			var minBoxY = sY;
			
			//Correct maxBoxX, maxBoxY values
			(eX > maxBoxX) ? (maxBoxX = eX):(minBoxX = eX);
			(eY > maxBoxY) ? (maxBoxY = eY):(minBoxY = eY);
			
			//Find the slopes from the synapse fromNode to the 4 corners of the selection box
			var slopes = [];
			slopes.push( (sY - fromNodeY) / (sX - fromNodeX) );
			slopes.push( (sY - fromNodeY) / (eX - fromNodeX) );
			slopes.push( (eY - fromNodeY) / (eX - fromNodeX) );
			slopes.push( (eY - fromNodeY) / (sX - fromNodeX) );
			
			var minSlope = slopes[0];
			var maxSlope = slopes[0];
			slopes.forEach(function(entry){
				if(entry > maxSlope) maxSlope = entry;
				if(entry < minSlope) minSlope = entry;					
			});
			
			//Find synapse-in-question's slope
			var synSlope = (toNodeY - fromNodeY) / (toNodeX - fromNodeX);
			var b = fromNodeY - synSlope * fromNodeX;

            //Use the selection box edges as test cases for synapse intersection
			var testX = sX;
			var testY = synSlope * testX + b;

            var selectTest;
			
			if(testX >= minX && testX <= maxX && testY >= minY && testY <= maxY && testY >= minBoxY && testY <= maxBoxY){
				selectTest = true;
			}
			
			testX = eX;
			testY = synSlope * testX + b;
			
			if(testX >= minX && testX <= maxX && testY >= minY && testY <= maxY && testY >= minBoxY && testY <= maxBoxY){
				selectTest = true;
			}
			
			testY = sY;
			testX = (testY - b)/synSlope;
			
			if(testX >= minX && testX <= maxX && testY >= minY && testY <= maxY && testX >= minBoxX && testX <= maxBoxX){
				selectTest = true;
			}
			
			testY = eY;
			testX = (testY - b)/synSlope;
			
			if(testX >= minX && testX <= maxX && testY >= minY && testY <= maxY && testX >= minBoxX && testX <= maxBoxX){
				selectTest = true;
			}

            //Case where the synapse is wholly enclosed in the seldction box
            if(fromNodeX >= minBoxX && fromNodeX <= maxBoxX && fromNodeY >= minBoxY && fromNodeY <= maxBoxY && toNodeX >= minBoxX && toNodeX <= maxBoxX && toNodeY >= minBoxY && toNodeY <= maxBoxY){
                selectTest = true;
            }			
			
            //The test synapse was selected!

            if(selectTest){
                // shiftKey = toggleSelect, otherwise 
				if(e.shiftKey){
					if(Metamaps.Selected.Edges.indexOf(edge) != -1 ){
						Metamaps.Control.deselectEdge(edge);
					}
					else{
						Metamaps.Control.selectEdge(edge);
					}
				}
				else{
					Metamaps.Control.selectEdge(edge);
				}
			}
		});
        Metamaps.Mouse.boxStartCoordinates = false;
        Metamaps.Mouse.boxEndCoordinates = false;
        Metamaps.Visualize.mGraph.plot();
    }, // selectWithBox
    drawSelectBox: function (eventInfo, e) {
        var ctx = Metamaps.Visualize.mGraph.canvas.getCtx();

        var startX = Metamaps.Mouse.boxStartCoordinates.x,
            startY = Metamaps.Mouse.boxStartCoordinates.y,
            currX = eventInfo.getPos().x,
            currY = eventInfo.getPos().y;

        Metamaps.Visualize.mGraph.canvas.clear();
        Metamaps.Visualize.mGraph.plot();

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, currY);
        ctx.lineTo(currX, currY);
        ctx.lineTo(currX, startY);
        ctx.lineTo(startX, startY);
        ctx.strokeStyle = "black";
        ctx.stroke();
    }, // drawSelectBox
    selectNodeOnClickHandler: function (node, e) {
        if (Metamaps.Visualize.mGraph.busy) return;

        var self = Metamaps.JIT;

        // catch right click on mac, which is often like ctrl+click
        if (navigator.platform.indexOf("Mac") != -1 && e.ctrlKey) {
            self.selectNodeOnRightClickHandler(node, e)
            return;
        }

        // if on a topic page, let alt+click center you on a new topic
        if (Metamaps.Active.Topic && e.altKey) {
            Metamaps.RGraph.centerOn(node.id);
            return;
        }

        var check = self.nodeWasDoubleClicked();
        if (check) {
            self.nodeDoubleClickHandler(node, e);
            return;
        } else {
            // wait a certain length of time, then check again, then run this code
            setTimeout(function () {
                if (!Metamaps.JIT.nodeWasDoubleClicked()) {

                    var nodeAlreadySelected = node.selected;

                    if (!e.shiftKey) {
                        Metamaps.Control.deselectAllNodes();
                        Metamaps.Control.deselectAllEdges();
                    }
                    
                    if (nodeAlreadySelected) {
                        Metamaps.Control.deselectNode(node);
                    } else {
                        Metamaps.Control.selectNode(node,e);
                    }
                    
                    //trigger animation to final styles
                    Metamaps.Visualize.mGraph.fx.animate({
                        modes: ['edge-property:lineWidth:color:alpha'],
                        duration: 500
                    });
                    Metamaps.Visualize.mGraph.plot();
                }
            }, Metamaps.Mouse.DOUBLE_CLICK_TOLERANCE);
        }
    }, //selectNodeOnClickHandler
    selectNodeOnRightClickHandler: function (node, e) {
        // the 'node' variable is a JIT node, the one that was clicked on
        // the 'e' variable is the click event

        e.preventDefault();
        e.stopPropagation();

        if (Metamaps.Visualize.mGraph.busy) return;

        // select the node
        Metamaps.Control.selectNode(node, e);

        // delete old right click menu
        $('.rightclickmenu').remove();
        // create new menu for clicked on node
        var rightclickmenu = document.createElement("div");
        rightclickmenu.className = "rightclickmenu";
        // add the proper options to the menu
        var menustring = '<ul>';

        var authorized = Metamaps.Active.Map && Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        var disabled = authorized ? "" : "disabled";

        if (Metamaps.Active.Map) menustring += '<li class="rc-hide"><div class="rc-icon"></div>Hide until refresh<div class="rc-keyboard">Ctrl+H</div></li>';
        if (Metamaps.Active.Map && Metamaps.Active.Mapper) menustring += '<li class="rc-remove ' + disabled + '"><div class="rc-icon"></div>Remove from map<div class="rc-keyboard">Ctrl+M</div></li>';
        if (Metamaps.Active.Map && Metamaps.Active.Mapper) menustring += '<li class="rc-delete ' + disabled + '"><div class="rc-icon"></div>Delete<div class="rc-keyboard">Ctrl+D</div></li>';
        

        if (Metamaps.Active.Topic) {
            menustring += '<li class="rc-center"><div class="rc-icon"></div>Center this topic</li>';
        }
        menustring += '<li class="rc-popout"><div class="rc-icon"></div>Open in new tab</li>';
        if (Metamaps.Active.Mapper) {
            var options = '<ul><li class="changeP toCommons"><div class="rc-perm-icon"></div>commons</li> \
                         <li class="changeP toPublic"><div class="rc-perm-icon"></div>public</li> \
                         <li class="changeP toPrivate"><div class="rc-perm-icon"></div>private</li> \
                     </ul>';

            menustring += '<li class="rc-spacer"></li>';

            menustring += '<li class="rc-permission"><div class="rc-icon"></div>Change permissions' + options + '<div class="expandLi"></div></li>';

            var metacodeOptions = $('#metacodeOptions').html();

            menustring += '<li class="rc-metacode"><div class="rc-icon"></div>Change metacode' + metacodeOptions + '<div class="expandLi"></div></li>';
        }
        if (Metamaps.Active.Topic) {

            if (!Metamaps.Active.Mapper) {
                menustring += '<li class="rc-spacer"></li>';
            }

            // set up the get sibling menu as a "lazy load"
            // only fill in the submenu when they hover over the get siblings list item
            var siblingMenu = '<ul id="fetchSiblingList"> \
                                <li class="fetchAll">All</li> \
                                <li id="loadingSiblings"></li> \
                            </ul>';
            menustring += '<li class="rc-siblings"><div class="rc-icon"></div>Get siblings' + siblingMenu + '<div class="expandLi"></div></li>';
        }

        menustring += '</ul>';
        rightclickmenu.innerHTML = menustring;

        // position the menu where the click happened
        var position = {};
        var RIGHTCLICK_WIDTH = 300;
        var RIGHTCLICK_HEIGHT = 144; // this does vary somewhat, but we can use static
        var SUBMENUS_WIDTH = 256;
        var MAX_SUBMENU_HEIGHT = 270;
        var windowWidth = $(window).width();
        var windowHeight = $(window).height();

        if (windowWidth - e.clientX < SUBMENUS_WIDTH) {
            position.right = windowWidth - e.clientX;  
            $(rightclickmenu).addClass('moveMenusToLeft');
        }
        else if (windowWidth - e.clientX < RIGHTCLICK_WIDTH) {
            position.right = windowWidth - e.clientX;
        }
        else if (windowWidth - e.clientX < RIGHTCLICK_WIDTH + SUBMENUS_WIDTH) {
            position.left = e.clientX; 
            $(rightclickmenu).addClass('moveMenusToLeft');
        }
        else position.left = e.clientX;

        if (windowHeight - e.clientY < MAX_SUBMENU_HEIGHT) {
            position.bottom = windowHeight - e.clientY;
            $(rightclickmenu).addClass('moveMenusUp');
        }
        else if (windowHeight - e.clientY < RIGHTCLICK_HEIGHT + MAX_SUBMENU_HEIGHT) {
            position.top = e.clientY;
            $(rightclickmenu).addClass('moveMenusUp');
        }
        else position.top = e.clientY;

        $(rightclickmenu).css(position);
        //add the menu to the page
        $('#wrapper').append(rightclickmenu);

        // attach events to clicks on the list items

        // delete the selected things from the database
        if (authorized) {
            $('.rc-delete').click(function () {
                $('.rightclickmenu').remove();
                Metamaps.Control.deleteSelected();
            });
        }

        // remove the selected things from the map
        if (authorized) {
            $('.rc-remove').click(function () {
                $('.rightclickmenu').remove();
                Metamaps.Control.removeSelectedEdges();
                Metamaps.Control.removeSelectedNodes();
            });
        }

        // hide selected nodes and synapses until refresh
        $('.rc-hide').click(function () {
            $('.rightclickmenu').remove();
            Metamaps.Control.hideSelectedEdges();
            Metamaps.Control.hideSelectedNodes();
        }); 

        // when in radial, center on the topic you picked
        $('.rc-center').click(function () {
            $('.rightclickmenu').remove();
            Metamaps.Topic.centerOn(node.id);
        });

        // open the entity in a new tab
        $('.rc-popout').click(function () {
            $('.rightclickmenu').remove();
            var win = window.open('/topics/' + node.id, '_blank');
            win.focus();
        });

        // change the permission of all the selected nodes and synapses that you were the originator of
        $('.rc-permission li').click(function () {
            $('.rightclickmenu').remove();
            // $(this).text() will be 'commons' 'public' or 'private'
            Metamaps.Control.updateSelectedPermissions($(this).text());
        });

        // change the metacode of all the selected nodes that you have edit permission for
        $('.rc-metacode li li').click(function () {
            $('.rightclickmenu').remove();
            //
            Metamaps.Control.updateSelectedMetacodes($(this).attr('data-id'));
        });


        // fetch relatives
        var fetched = false;
        $('.rc-siblings').hover(function () {
            if (!fetched) {
                Metamaps.JIT.populateRightClickSiblings(node);
                fetched = true;
            }
        });
        $('.rc-siblings .fetchAll').click(function () {
            $('.rightclickmenu').remove();
            // data-id is a metacode id
            Metamaps.Topic.fetchRelatives(node);
        });
    }, //selectNodeOnRightClickHandler,
    populateRightClickSiblings: function(node) {
        var self = Metamaps.JIT;

        // depending on how many topics are selected, do different things
        /*if (Metamaps.Selected.Nodes.length > 1) {
            // we don't bother filling the submenu with 
            // specific numbers, because there are too many topics
            // selected to find those numbers
            $('#loadingSiblings').remove();
            return;
        }*/

        var topic = node.getData('topic');

        // add a loading icon for now
        var loader = new CanvasLoader('loadingSiblings');
        loader.setColor('#4FC059'); // default is '#000000'
        loader.setDiameter(15); // default is 40
        loader.setDensity(41); // default is 40
        loader.setRange(0.9); // default is 1.3
        loader.show(); // Hidden by default

        var topics = Metamaps.Topics.map(function(t){ return t.id });
        var topics_string = topics.join();

        var successCallback = function(data) {
            $('#loadingSiblings').remove();

            for (var key in data) {
                var string = Metamaps.Metacodes.get(key).get('name') + ' (' + data[key] + ')';
                $('#fetchSiblingList').append('<li class="getSiblings" data-id="' + key + '">' + string + '</li>');
            }

            $('.rc-siblings .getSiblings').click(function () {
                $('.rightclickmenu').remove();
                // data-id is a metacode id
                Metamaps.Topic.fetchRelatives(node, $(this).attr('data-id'));
            });
        };

        $.ajax({
            type: "Get",
            url: "/topics/" + topic.id + "/relative_numbers.json?network=" + topics_string,
            success: successCallback,
            error: function () {
                
            }
        });
    },
    selectEdgeOnClickHandler: function (adj, e) {
        if (Metamaps.Visualize.mGraph.busy) return;

        var self = Metamaps.JIT;

        // catch right click on mac, which is often like ctrl+click
        if (navigator.platform.indexOf("Mac") != -1 && e.ctrlKey) {
            self.selectEdgeOnRightClickHandler(adj, e)
            return;
        }

        var check = self.nodeWasDoubleClicked();
        if (check) {
            self.edgeDoubleClickHandler(adj, e);
            return;
        } else {
            // wait a certain length of time, then check again, then run this code
            setTimeout(function () {
                if (!Metamaps.JIT.nodeWasDoubleClicked()) {

                    var edgeAlreadySelected = Metamaps.Selected.Edges.indexOf(adj) !== -1;

                    if (!e.shiftKey) {
                        Metamaps.Control.deselectAllNodes();
                        Metamaps.Control.deselectAllEdges();
                    }

                    if (edgeAlreadySelected) {
                        Metamaps.Control.deselectEdge(adj);
                    } else {
                        Metamaps.Control.selectEdge(adj);
                    }

                    Metamaps.Visualize.mGraph.plot();
                }
            }, Metamaps.Mouse.DOUBLE_CLICK_TOLERANCE);
        }
    }, //selectEdgeOnClickHandler
    selectEdgeOnRightClickHandler: function (adj, e) {
        // the 'node' variable is a JIT node, the one that was clicked on
        // the 'e' variable is the click event

        if (adj.getData('alpha') === 0) return; // don't do anything if the edge is filtered

        var authorized;

        e.preventDefault();
        e.stopPropagation();

        if (Metamaps.Visualize.mGraph.busy) return;

        Metamaps.Control.selectEdge(adj);

        // delete old right click menu
        $('.rightclickmenu').remove();
        // create new menu for clicked on node
        var rightclickmenu = document.createElement("div");
        rightclickmenu.className = "rightclickmenu";

        // add the proper options to the menu
        var menustring = '<ul>';

        var authorized = Metamaps.Active.Map && Metamaps.Active.Map.authorizeToEdit(Metamaps.Active.Mapper);

        var disabled = authorized ? "" : "disabled";

        if (Metamaps.Active.Map) menustring += '<li class="rc-hide"><div class="rc-icon"></div>Hide until refresh<div class="rc-keyboard">Ctrl+H</div></li>';
        if (Metamaps.Active.Map && Metamaps.Active.Mapper) menustring += '<li class="rc-remove ' + disabled + '"><div class="rc-icon"></div>Remove from map<div class="rc-keyboard">Ctrl+M</div></li>';
        if (Metamaps.Active.Map && Metamaps.Active.Mapper) menustring += '<li class="rc-delete ' + disabled + '"><div class="rc-icon"></div>Delete<div class="rc-keyboard">Ctrl+D</div></li>';

        if (Metamaps.Active.Map && Metamaps.Active.Mapper) menustring += '<li class="rc-spacer"></li>';

        if (Metamaps.Active.Mapper) {
            var permOptions = '<ul><li class="changeP toCommons"><div class="rc-perm-icon"></div>commons</li> \
                         <li class="changeP toPublic"><div class="rc-perm-icon"></div>public</li> \
                         <li class="changeP toPrivate"><div class="rc-perm-icon"></div>private</li> \
                     </ul>';

            menustring += '<li class="rc-permission"><div class="rc-icon"></div>Change permissions' + permOptions + '<div class="expandLi"></div></li>';
        }

        menustring += '</ul>';
        rightclickmenu.innerHTML = menustring;

        // position the menu where the click happened
        var position = {};
        var RIGHTCLICK_WIDTH = 300;
        var RIGHTCLICK_HEIGHT = 144; // this does vary somewhat, but we can use static
        var SUBMENUS_WIDTH = 256;
        var MAX_SUBMENU_HEIGHT = 270;
        var windowWidth = $(window).width();
        var windowHeight = $(window).height();

        if (windowWidth - e.clientX < SUBMENUS_WIDTH) {
            position.right = windowWidth - e.clientX;  
            $(rightclickmenu).addClass('moveMenusToLeft');
        }
        else if (windowWidth - e.clientX < RIGHTCLICK_WIDTH) {
            position.right = windowWidth - e.clientX;
        }
        else position.left = e.clientX;

        if (windowHeight - e.clientY < MAX_SUBMENU_HEIGHT) {
            position.bottom = windowHeight - e.clientY;
            $(rightclickmenu).addClass('moveMenusUp');
        }
        else if (windowHeight - e.clientY < RIGHTCLICK_HEIGHT + MAX_SUBMENU_HEIGHT) {
            position.top = e.clientY;
            $(rightclickmenu).addClass('moveMenusUp');
        }
        else position.top = e.clientY;

        $(rightclickmenu).css(position);

        //add the menu to the page
        $('#wrapper').append(rightclickmenu);


        // attach events to clicks on the list items

        // delete the selected things from the database
        if (authorized) {
            $('.rc-delete').click(function () {
                $('.rightclickmenu').remove();
                Metamaps.Control.deleteSelected();
            });
        }

        // remove the selected things from the map
        if (authorized) {
            $('.rc-remove').click(function () {
                $('.rightclickmenu').remove();
                Metamaps.Control.removeSelectedEdges();
                Metamaps.Control.removeSelectedNodes();
            });
        }

        // hide selected nodes and synapses until refresh
        $('.rc-hide').click(function () {
            $('.rightclickmenu').remove();
            Metamaps.Control.hideSelectedEdges();
            Metamaps.Control.hideSelectedNodes();
        });

        // change the permission of all the selected nodes and synapses that you were the originator of
        $('.rc-permission li').click(function () {
            $('.rightclickmenu').remove();
            // $(this).text() will be 'commons' 'public' or 'private'
            Metamaps.Control.updateSelectedPermissions($(this).text());
        });

    }, //selectEdgeOnRightClickHandler
    SmoothPanning: function () {

        var sx = Metamaps.Visualize.mGraph.canvas.scaleOffsetX,
            sy = Metamaps.Visualize.mGraph.canvas.scaleOffsetY,
            y_velocity = Metamaps.Mouse.changeInY, // initial y velocity
            x_velocity = Metamaps.Mouse.changeInX, // initial x velocity
            easing = 1; // frictional value

        easing = 1;
        window.clearInterval(panningInt)
        panningInt = setInterval(function () {
            myTimer()
        }, 1);

        function myTimer() {
            Metamaps.Visualize.mGraph.canvas.translate(x_velocity * easing * 1 / sx, y_velocity * easing * 1 / sy);
            $(document).trigger(Metamaps.JIT.events.pan);
            easing = easing * 0.75;

            if (easing < 0.1) window.clearInterval(panningInt);
        }
    }, // SmoothPanning
    renderMidArrow: function (from, to, dim, swap, canvas, placement, newSynapse) {
        var ctx = canvas.getCtx();
        // invert edge direction 
        if (swap) {
            var tmp = from;
            from = to;
            to = tmp;
        }
        // vect represents a line from tip to tail of the arrow 
        var vect = new $jit.Complex(to.x - from.x, to.y - from.y);
        // scale it 
        vect.$scale(dim / vect.norm());
        // compute the midpoint of the edge line 
        var newX = (to.x - from.x) * placement + from.x;
        var newY = (to.y - from.y) * placement + from.y;
        var midPoint = new $jit.Complex(newX, newY);

        // move midpoint by half the "length" of the arrow so the arrow is centered on the midpoint 
        var arrowPoint = new $jit.Complex((vect.x / 0.7) + midPoint.x, (vect.y / 0.7) + midPoint.y);
        // compute the tail intersection point with the edge line 
        var intermediatePoint = new $jit.Complex(arrowPoint.x - vect.x, arrowPoint.y - vect.y);
        // vector perpendicular to vect 
        var normal = new $jit.Complex(-vect.y / 2, vect.x / 2);
        var v1 = intermediatePoint.add(normal);
        var v2 = intermediatePoint.$add(normal.$scale(-1));

        if (newSynapse) {
            ctx.strokeStyle = "#4fc059";
            ctx.lineWidth = 2;
            ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(arrowPoint.x, arrowPoint.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.stroke();
    }, // renderMidArrow
    renderEdgeArrows: function (edgeHelper, adj, synapse, canvas) {

        var self = Metamaps.JIT;

        var directionCat = synapse.get('category');
        var direction = synapse.getDirection();

        var pos = adj.nodeFrom.pos.getc(true);
        var posChild = adj.nodeTo.pos.getc(true);

        //plot arrow edge 
        if (!direction) {
            // render nothing for this arrow if the direction couldn't be retrieved
        } else if (directionCat == "none") {
            edgeHelper.line.render({
                x: pos.x,
                y: pos.y
            }, {
                x: posChild.x,
                y: posChild.y
            }, canvas);
        } else if (directionCat == "both") {
            self.renderMidArrow({
                x: pos.x,
                y: pos.y
            }, {
                x: posChild.x,
                y: posChild.y
            }, 13, true, canvas, 0.7);
            self.renderMidArrow({
                x: pos.x,
                y: pos.y
            }, {
                x: posChild.x,
                y: posChild.y
            }, 13, false, canvas, 0.7);
        } else if (directionCat == "from-to") {
            var inv = (direction[0] != adj.nodeFrom.id);
            self.renderMidArrow({
                x: pos.x,
                y: pos.y
            }, {
                x: posChild.x,
                y: posChild.y
            }, 13, inv, canvas, 0.7);
            self.renderMidArrow({
                x: pos.x,
                y: pos.y
            }, {
                x: posChild.x,
                y: posChild.y
            }, 13, inv, canvas, 0.3);
        }
    }, //renderEdgeArrows
    zoomIn: function (event) {
        Metamaps.Visualize.mGraph.canvas.scale(1.25,1.25);
        $(document).trigger(Metamaps.JIT.events.zoom, [event]);
    },
    zoomOut: function (event) {
        Metamaps.Visualize.mGraph.canvas.scale(0.8,0.8);
        $(document).trigger(Metamaps.JIT.events.zoom, [event]);
    },
    centerMap: function (canvas) {
        var offsetScale = canvas.scaleOffsetX;
                
        canvas.scale(1/offsetScale,1/offsetScale);

        var offsetX = canvas.translateOffsetX;
        var offsetY = canvas.translateOffsetY;

        canvas.translate(-1*offsetX,-1*offsetY);
    },
    zoomToBox: function (event) {
        var sX = Metamaps.Mouse.boxStartCoordinates.x,
            sY = Metamaps.Mouse.boxStartCoordinates.y,
            eX = Metamaps.Mouse.boxEndCoordinates.x,
            eY = Metamaps.Mouse.boxEndCoordinates.y;

        var canvas = Metamaps.Visualize.mGraph.canvas;
        Metamaps.JIT.centerMap(canvas);

        var height = $(document).height(),
            width = $(document).width();

        var spanX = Math.abs(sX - eX);
        var spanY = Math.abs(sY - eY);
        var ratioX = width / spanX;
        var ratioY = height / spanY;

        var newRatio = Math.min(ratioX,ratioY);

        if(canvas.scaleOffsetX *newRatio<= 5 && canvas.scaleOffsetX*newRatio >= 0.2){
            canvas.scale(newRatio,newRatio);
        }
        else if(canvas.scaleOffsetX * newRatio > 5){
            newRatio = 5/ canvas.scaleOffsetX;
            canvas.scale(newRatio,newRatio);
        }
        else{
            newRatio = 0.2/ canvas.scaleOffsetX;
            canvas.scale(newRatio,newRatio);
        } 

        var cogX = (sX + eX)/2;
        var cogY = (sY + eY)/2;

        canvas.translate(-1* cogX, -1* cogY);
        $(document).trigger(Metamaps.JIT.events.zoom, [event]); 

        Metamaps.Mouse.boxStartCoordinates = false;
        Metamaps.Mouse.boxEndCoordinates = false;
        Metamaps.Visualize.mGraph.plot();
        
    },
    zoomExtents: function (event, canvas, denySelected) {
        Metamaps.JIT.centerMap(canvas);
        var height = canvas.getSize().height,
            width = canvas.getSize().width,
            maxX, minX, maxY, minY, counter = 0;

        
        if (!denySelected && Metamaps.Selected.Nodes.length > 0) {
            var nodes = Metamaps.Selected.Nodes;
        }
        else {
            var nodes = _.values(Metamaps.Visualize.mGraph.graph.nodes);
        }

        if(nodes.length > 1){
            nodes.forEach(function (n) {
                var x = n.pos.x,
                    y = n.pos.y;

                if (counter == 0 && n.getData('alpha') == 1){
                    maxX = x;
                    minX = x; 
                    maxY = y;
                    minY = y; 
                }

                var arrayOfLabelLines = Metamaps.Util.splitLine(n.name, 30).split('\n'),
                    dim = n.getData('dim'),
                    ctx = canvas.getCtx();

                var height = 25 * arrayOfLabelLines.length;

                var index, lineWidths = [];
                for (index = 0; index < arrayOfLabelLines.length; ++index) {
                    lineWidths.push(ctx.measureText(arrayOfLabelLines[index]).width)
                }
                var width = Math.max.apply(null, lineWidths) + 8;

                // only adjust these values if the node is not filtered
                if (n.getData('alpha') == 1) {
                    maxX = Math.max(x + width /2,maxX);
                    maxY = Math.max(y + n.getData("height") + 5 + height,maxY);
                    minX = Math.min(x - width /2,minX);
                    minY = Math.min(y - dim,minY);

                    counter++;
                }
            });

            var spanX = maxX - minX;
            var spanY = maxY - minY;
            var ratioX = spanX / width;
            var ratioY = spanY / height;

            var cogX = (maxX + minX)/2;
            var cogY = (maxY + minY)/2;

            canvas.translate(-1* cogX, -1* cogY);

            var newRatio = Math.max(ratioX,ratioY);
            var scaleMultiplier = 1/newRatio*0.9;

            if(canvas.scaleOffsetX *scaleMultiplier<= 3 && canvas.scaleOffsetX*scaleMultiplier >= 0.2){
                canvas.scale(scaleMultiplier,scaleMultiplier);
            }
            else if(canvas.scaleOffsetX * scaleMultiplier > 3){
                scaleMultiplier = 3/ canvas.scaleOffsetX;
                canvas.scale(scaleMultiplier,scaleMultiplier);
            }
            else{
                scaleMultiplier = 0.2/ canvas.scaleOffsetX;
                canvas.scale(scaleMultiplier,scaleMultiplier);
            }
            
            $(document).trigger(Metamaps.JIT.events.zoom, [event]);
        }
        else if(nodes.length == 1){
            nodes.forEach(function (n) {
                var x = n.pos.x,
                    y = n.pos.y;

                canvas.translate(-1* x, -1* y);
                $(document).trigger(Metamaps.JIT.events.zoom, [event]); 
            });
        }
    }
};
