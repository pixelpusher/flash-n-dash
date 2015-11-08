//
// arduino-lamp-server.js (c) 2015 by Evan Raskob e.raskob@rave.ac.uk
//
// This sets up a web server connected to an Arduino with a NeoPixel ring
// working like a budget Philips Lumen system, using an HTML/JS front end
// that uses websockets to communicate back to this NodeJS server.
//


/////////////////////////////////////////////////////////////
// include Arduino-communications library --------------------------------------
// from Nick Rothwell at https://github.com/cassiel/arduino-polyglot
/////////////////////////////////////////////////////////////
var commsLib = require("./lib/comms");

// these map character commands to local functions, for instance '!' to a print
var arduinoCallbacks =
{
  '!': function(data)
  {
    return console.log("CALLBACK: received ! from Arduino");
  },
  'L': function(data)
  {
    console.log("CALLBACK: received L from Arduino");
    console.log(data);
    return;
  }
  
};

// this is the communication object that represents the Arduino attached via USB (serial)

var arduino = new commsLib.Comms(
  "", // default to first arduino
  { baudrate: 28800 },
  arduinoCallbacks
);

// end including Arduino-communications library ---------------------------------


/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////
///////  WEB SERVER CODE STARTS HERE
/////////////////////////////////////////////////////////////

// SERVER IS ON PORT 8080 in the current directory (webduino folder)

// http://localhost:8080/FILENAME.html

/*  MAKING THIS ACCESSIBLE FROM OTHER MACHINES ***********
 
To get the ip address, open System Preferences and have a look at Network, or just type in "ifconfig -a | grep inet" into the Terminal.  (this server also prints it out to the console when it runs)

The important file is the client one (whichever you're using), change the server IP from 'localhost' to your IP address.

Then, to get it to simply work on port 80 (standard web port so you don't need the :8080) you turn on the OS X firewall (in Security, in System Preferences) and then in Terminal type in:

"sudo ipfw add 100 fwd 127.0.0.1,8080 tcp from any to any 80 in"

If you're really slick, you can set your router to give your machine the same IP address all the time based on its MAC address, so you don't have to change the ip addresses in the code again, and you can also give it a better name rather than asking people to type "192.168.0.3" or whatever into the URL bar.
*/


// port server should run on, must be >= 8000
var port = 8080;

// start the server
var connect = require('connect');
var serveStatic = require('serve-static');
var server = connect();

// print out the directory we're in:
console.log("Server directory:" + __dirname);

// start the app that will server pages in the folder
var app = server.use(serveStatic(__dirname)).listen(port);

// start websockets listening to our app
var io = require('socket.io').listen(app);

// print out some info
console.log("http server on " + port);

console.log(getIPAddresses());


/////////////////////////////////////////////////////////////
///////  WEB SERVER CODE ENDS HERE
/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////
///////  WEB SOCKETS CODE STARTS HERE
/////////////////////////////////////////////////////////////

//
// This next code runs automatically when a web browser connects to the server
// This defines the web browser to server API
//

var clients = [];
//http://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR
 * h, s, v
*/
function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function makeEmptyClients(n) {
  clients = [];
  for (var i=0; i<n; i++) {
    var client = {};
    var h = i/n;
    client.hue = h;
    client.rgb = HSVtoRGB(h, 1, 1);
    client.index = i;
    client.socket = false;
    clients.push(client);
  }
}
makeEmptyClients(5);



io.sockets.on('connection', function (socket)
{
  
  console.log("connecting to client...");
  // for testing - just show us the IP address the server is running on
  // console.log( getIPAddresses() );
  var client;
  for (var i=0; i<clients.length; i++) {
    var possibleClient = clients[i];
    if (!possibleClient.socket){
      client = possibleClient;
      client.socket = socket;
      console.log("client " + i + " connected");
      socket.emit('clientInit', {index: client.index, rgb: client.rgb});
      break;
    }
  }
  if (!client) console.log("couldn't assign slot to new client; too many connections open");
  
  socket.on('pressed', function(data) {
    console.log("client " + client.index + " pressed");
    
    /// send client.rgb to arduino
  });
  
  
  socket.on('color', function (color) {
    
    console.log("WEBSOCKETS MSG::::color: ");
    console.log(color);
    
    // transmit color codes to the Arduino
    arduino.xmit('c', [color.h, color.s, color.v]);
  });


  socket.on('off', function (color) {

    console.log("WEBSOCKETS MSG::::off");
    
    arduino.xmit('o', [0]); // send a 0
    
    arduino.xmit('L', [1]);
  });


  socket.on('on', function (color) {

    console.log("WEBSOCKETS MSG::::on");

    arduino.xmit('n', [0]); // send a 0
    arduino.xmit('L', [0]);
  });
  

  socket.on('disconnect', function() {
    client.socket = false;
    if (!client) console.log("unidentified client disconnected?");
    console.log("client " + client.index + " disconnected");
    io.sockets.emit('disconnect', 'true');
  });
});



io.sockets.on('error', function (data) {
  console.log("sockets error: "  + data);
}
);

/////////////////////////////////////////////////////////////
///////  WEB SOCKETS CODE ENDS HERE
/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////




//
// for testing: get all IP addresses for this host
//
function getIPAddresses()
{
  var ipAddresses = [];

  var interfaces = require('os').networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        ipAddresses.push(alias.address);
      }
    }
  }

  return ipAddresses;
}
