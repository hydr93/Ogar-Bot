// Project imports
var BotPlayer = require('./BotPlayer');
var QBot = require("./QBot");
var FakeSocket = require('./FakeSocket');
var PacketHandler = require('../PacketHandler');

function BotLoader(gameServer) {
    this.gameServer = gameServer;
    this.loadNames();
}

module.exports = BotLoader;

BotLoader.prototype.getName = function() {
    var name = "";

    // Picks a random name for the bot
    if (this.randomNames.length > 0) {
        var index = Math.floor(Math.random() * this.randomNames.length);
        name = this.randomNames[index];
        this.randomNames.splice(index, 1);
    } else {
        name = "bot" + ++this.nameIndex;
    }

    return name;
};

BotLoader.prototype.loadNames = function() {
    this.randomNames = [];

    // Load names
    try {
        var fs = require("fs"); // Import the util library

        // Read and parse the names - filter out whitespace-only names
        this.randomNames = fs.readFileSync("/Users/hydr93/Developer/GitHub/Ogar-Bot/src/botnames.txt", "utf8").split(/[\r\n]+/).filter(function(x) {
            return x != ''; // filter empty names
        });
    } catch (e) {
        // Nothing, use the default names
    }

    this.nameIndex = 0;
};

BotLoader.prototype.addBot = function() {
    for ( var i = 0; i < 1; i++){
        if (i == 0){
            var s = new FakeSocket(this.gameServer);
            s.playerTracker = new QBot(this.gameServer, s);
            s.packetHandler = new PacketHandler(this.gameServer, s);

            // Add to client list
            this.gameServer.clients.push(s);

            // Add to world
            s.packetHandler.setNickname("QBot");
        }else{
            var s = new FakeSocket(this.gameServer);
            s.playerTracker = new BotPlayer(this.gameServer, s);
            s.packetHandler = new PacketHandler(this.gameServer, s);

            // Add to client list
            this.gameServer.clients.push(s);

            // Add to world
            s.packetHandler.setNickname(this.getName());
        }

    }

};
