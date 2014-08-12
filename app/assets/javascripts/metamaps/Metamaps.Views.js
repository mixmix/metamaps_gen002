(function () {
    Metamaps.Views = {};
    
Metamaps.Views.init = function () {

    Metamaps.Views.MapCard = Backbone.View.extend({

        template: Hogan.compile( $('#mapCardTemplate').html() ),

        tagName: "div",

        className: "map",

        id: function() {
            return this.model.id;
        },

        events: {
            "click .icon": "open",
            "click .button.edit": "openEditDialog",
            "click .button.delete": "destroy"
        },

        initialize: function () {
            this.listenTo(this.model, "change", this.render);
        },

        render: function () {
            this.$el.html( this.template.render(this.model.attrForCards()) );
            return this;
        }

    });

    var mapsWrapper = Backbone.View.extend({

        el: '.mapsWrapper',

        initialize: function (opts) {
            
        },
        setCollection: function (collection) {
            if (this.collection) this.stopListening(this.collection);
            this.collection = collection;
            this.listenTo(this.collection, 'successOnFetch', this.handleSuccess);
            this.listenTo(this.collection, 'errorOnFetch', this.handleError);
        },
        render: function () {
            
            var that = this;
            this.$el.empty();

            this.collection.each(function (map) {
                var view = new Metamaps.Views.MapCard({ model: map });

                that.$el.append( view.render().el );
            });

            Metamaps.Loading.loader.hide();
            setTimeout(function(){
                var path = Metamaps.currentSection == "" ? "" : "/explore/" + Metamaps.currentPage; 
                Metamaps.Router.navigate(path);
            }, 500);
        },
        handleSuccess: function () {
            this.render();
        },
        handleError: function () {
            console.log('error loading maps!'); //TODO 
        }
    });

    Metamaps.Views.exploreMaps = new mapsWrapper();
};

})();