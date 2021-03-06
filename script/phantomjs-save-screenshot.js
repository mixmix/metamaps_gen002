//parse arguments passed from command line (or more likely, from rails)
var system = require('system');
var args = system.args;
if (args.length <= 1) {
  phantom.exit();
  throw new Error("no arguments supplied on command line");
}//if

//configurable variables - CHANGE ME
var mapID = args[1];
var environment = args[2];
var address = environment === 'development' ? 'http://localhost:3000' : 'http://metamaps.herokuapp.com';
var url = address + '/maps/' + mapID;
var width = 940;
var height = 630;

//set up page and the area we'll render as a PNG
var page = require('webpage').create();
page.viewportSize = {
  width: width,
  height: height
};

page.open(url, function (status) {
  if (status === 'success') {
    //since this isn't evaluateAsync, it should also ensure the asynchronous
    //js stuff is loaded too, hopefully?

    page.onCallback = function(data){
      
      //pass to ruby
      console.log(page.renderBase64('PNG'));

      //render to the metamaps_gen002 directory for debug
      //page.render('map1.png', 'PNG');
      
      phantom.exit();
    };

    page.evaluate(function() {
      
      $(document).ready(function () {
          //$(document).on(Metamaps.JIT.events.animationDone, function() {
          setTimeout(function(){
            $('.upperLeftUI, .upperRightUI, .mapControls, .infoAndHelp, .uv-icon, .footer').hide();
            Metamaps.JIT.zoomExtents();
            window.callPhantom();
          }, 5000);
      });

    });//page.evaluate

  } else {
    //failed to load
    phantom.exit();
  }//if
});
