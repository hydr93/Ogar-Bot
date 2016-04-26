/**
 * Created by hydr93 on 09/03/16.
 */

var PlayerTracker = require('../PlayerTracker');
var gameServer = require('../GameServer');
var CommandList = require("../modules/CommandList");

var Synaptic = require("synaptic");
var Reinforce = require("Reinforcejs");

var fs = require("fs");
const JSON_FILE = "/Users/hydr93/Developer/GitHub/Ogar-Bot/src/ai/json";

const REPORT_FILE = "/Users/hydr93/Developer/GitHub/Ogar-Bot/reports/report7.txt";

// Number of tries till the cell gets to the TRIAL_RESET_MASS
var trial = 1;

// Server will be restarted when the cell's mass is equal to this.
const TRIAL_RESET_MASS = 100;

// Maximum Speed a cell can have
const MAX_SPEED = 150.0;

// Maximum Distance between two cells
const MAX_DISTANCE = 1500.0;

// Maximum Angle :)
const MAX_ANGLE = Math.PI;

// Maximum Mass Difference between two cells.
const MAX_MASS_DIFFERENCE = 20;

const FOOD_NO = 1;
const VIRUS_NO = 0;
const THREAT_NO = 0;
const PREY_NO = 0;

function QBot() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    //this.color = gameServer.getRandomColor();

    // AI only
    this.gameState = 0;
    this.path = [];

    this.allEnemies = [];

    this.threats = []; // List of cells that can eat this bot but are too far away
    this.prey = []; // List of cells that can be eaten by this bot
    this.food = [];
    this.virus = []; // List of viruses

    this.target;
    this.targetVirus; // Virus used to shoot into the target
    this.virusShots = 0; // Amount of pressed W to explode target via target virus

    this.ejectMass = 0; // Amount of times to eject mass
    this.targetPos = {
        x: 0,
        y: 0
    };

    this.previousMass = 10;

    // Initialize DQN Environment
    var env = {};
    env.getNumStates = function() { return (3*FOOD_NO + 3*VIRUS_NO + 4*THREAT_NO + 4*PREY_NO);};
    env.getMaxNumActions = function() {return 24;};
    var spec = {
        update: 'qlearn',
        gamma: 0.9,
        epsilon: 0.2,
        alpha: 0.1,
        experience_add_every: 10,
        experience_size: 5000,
        learning_steps_per_iteration: 20,
        tderror_clamp: 1.0,
        num_hidden_units: Math.floor(env.getNumStates()*2.5)
    };
    this.agent;
    try {
        var json = JSON.parse(fs.readFileSync(JSON_FILE,"utf8"));
        //console.log("Reading From JSON");
        this.agent = new Reinforce.RL.DQNAgent(env, spec);
        this.agent.fromJSON(json);
    } catch (e){
        this.agent = new Reinforce.RL.DQNAgent(env,spec);
    }

    // Report the important information to REPORT_FILE
    fs.appendFile(REPORT_FILE, "Test 7: No Enemy, No Virus\n\nNumber of States: "+env.getNumStates()+"\nNumber of Actions: "+env.getMaxNumActions()+"\nNumber of Hidden Units: "+spec.num_hidden_units+"\n");
    var date = new Date();
    fs.appendFile(REPORT_FILE, "\nStates:\n\t"+ FOOD_NO +" Food\n\t\tEnabler\n\t\tDirection\n\t\tDistance\n\t"+ VIRUS_NO +" Virus\n\t\tEnabler\n\t\tDirection\n\t\tDistance\n\t"+ THREAT_NO +" Threat\n\t\tEnabler\n\t\tDirection\n\t\tDistance\n\t\tSize\n\t"+ PREY_NO +" Prey\n\t\tEnabler\n\t\tDirection\n\t\tDistance\n\t\tSize\nActions:\n\tWalk\n\t\t8 Directions\n\t\t3 Speed\n");
    fs.appendFile(REPORT_FILE, "\nTrial Reset Mass: "+TRIAL_RESET_MASS+"\n");
    fs.appendFile(REPORT_FILE, "\nTrial No: "+ trial++ +"\n\tBirth: "+date+"\n");

    this.shouldUpdateQNetwork = false;
}

module.exports = QBot;
QBot.prototype = new PlayerTracker();

// Functions

// Returns the lowest cell of the player
QBot.prototype.getLowestCell = function() {
    // Gets the cell with the lowest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }

    // Starting cell
    var lowest = this.cells[0];
    for (i = 1; i < this.cells.length; i++) {
        if (lowest.mass > this.cells[i].mass) {
            lowest = this.cells[i];
        }
    }
    return lowest;
};

// Returns the highest cell of the player
QBot.prototype.getHighestCell = function() {
    // Gets the cell with the highest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }

    // Starting cell
    var highest = this.cells[0];
    for (i = 1; i < this.cells.length; i++) {
        if (highest.mass > this.cells[i].mass) {
            highest = this.cells[i];
        }
    }
    return highest;
};

// Don't override, testing to use more accurate way.
/*
 QBot.prototype.updateSightRange = function() { // For view distance
 var range = 1000; // Base sight range

 if (this.cells[0]) {
 range += this.cells[0].getSize() * 2.5;
 }

 this.sightRangeX = range;
 this.sightRangeY = range;
 }; */

// Overrides the update function from player tracker
QBot.prototype.update = function() {

    // Remove nodes from visible nodes if possible
    for (var i = 0; i < this.nodeDestroyQueue.length; i++) {
        var index = this.visibleNodes.indexOf(this.nodeDestroyQueue[i]);
        if (index > -1) {
            this.visibleNodes.splice(index, 1);
        }
    }

    // Respawn if bot is dead
    if (this.cells.length <= 0) {
        this.gameServer.gameMode.onPlayerSpawn(this.gameServer, this);
        if (this.cells.length == 0) {

            // If the bot cannot spawn any cells, then disconnect it
            this.socket.close();
            return;
        }
        var date = new Date();
        console.log(date);
        // Report the important information to REPORT_FILE
        fs.appendFile(REPORT_FILE, "\nTrial No: "+ trial++ +"\n\tBirth: "+date+"\n");
    }

    // Calculate nodes
    this.visibleNodes = this.calcViewBox();

    var dy = this.viewBox.bottomY - this.viewBox.topY;
    var dx = this.viewBox.rightX - this.viewBox.leftX;

    // Get Lowest cell of the bot
    var cell = this.getLowestCell();
    var r = cell.getSize();
    this.clearLists();


    // Assign Preys, Threats, Viruses & Foods
    this.updateLists(cell);

    this.food.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });
    this.prey.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });
    this.threats.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });
    this.virus.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });
    this.allEnemies.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });

    // Action
    if ( this.shouldUpdateQNetwork ){
        var reward = cell.mass - this.previousMass;
        //console.log("Reward: "+reward);
        this.agent.learn(reward);
        this.shouldUpdateQNetwork = false;
        var json = this.agent.toJSON();
        fs.writeFile(JSON_FILE, JSON.stringify(json, null, 4));
    }

    // Learn till the mass is equal to Reset Mass
    if ( cell.mass > TRIAL_RESET_MASS){
        CommandList.list.killall(this.gameServer,0);
        var date = new Date();
        // Report the important information to REPORT_FILE
        fs.appendFile(REPORT_FILE, "\tDeath: "+date+"\n");
    }

    this.decide(cell);

    //console.log("Current Position\nX: "+cell.position.x+"\nY: "+cell.position.y);
    //console.log("Destination Position\nX: "+this.targetPos.x+"\nY: "+this.targetPos.y);

    // Now update mouse
    this.mouse = {
        x: this.targetPos.x,
        y: this.targetPos.y
    };

    // Reset queues
    this.nodeDestroyQueue = [];
    this.nodeAdditionQueue = [];
};

// Custom

QBot.prototype.clearLists = function() {
    this.allEnemies = [];
    this.threats = [];
    this.prey = [];
    this.food = [];
    this.virus = [];
};


//Decides the action of player
QBot.prototype.decide = function(cell) {

    // Find Nearby N Foods
    var nearbyFoods = this.findNearby(cell,this.food,FOOD_NO);
    var qList = [];
    for ( var i = 0; i < FOOD_NO; i++){
        if ( nearbyFoods != null && i < nearbyFoods.length ){
            var foodStateVector = this.getStateVectorFromLocation(cell,nearbyFoods[i]);
            var foodEnabler = 1;
            qList.push(foodEnabler,foodStateVector.direction/MAX_ANGLE,foodStateVector.distance/MAX_DISTANCE);
        }else{
            qList.push(0,0,0);
        }
    }

    // Find Nearby N Viruses
    var nearbyViruses = this.findNearby(cell,this.virus,VIRUS_NO);
    for ( var i = 0; i < VIRUS_NO; i++){
        if ( nearbyViruses != null && i < nearbyViruses.length ){
            var virusStateVector = this.getStateVectorFromLocation(cell,nearbyViruses[i]);
            var virusEnabler = 1;
            qList.push(virusEnabler,virusStateVector.direction/MAX_ANGLE,virusStateVector.distance/MAX_DISTANCE);
        }else{
            qList.push(0,0,0);
        }
    }

    // Find Nearby N Preys
    var nearbyPreys = this.findNearby(cell,this.prey,PREY_NO);
    for ( var i = 0; i < PREY_NO; i++){
        if ( nearbyPreys != null && i < nearbyPreys.length ){
            var preyStateVector = this.getStateVectorFromLocation(cell,nearbyPreys[i]);
            var preyEnabler = 1;
            var preyMassDifference = this.getMassDifference(cell,nearbyPreys[i]);
            qList.push(preyEnabler,preyStateVector.direction/MAX_ANGLE,preyStateVector.distance/MAX_DISTANCE,preyMassDifference/MAX_MASS_DIFFERENCE);
        }else{
            qList.push(0,0,0,0);
        }
    }

    // Find Nearby N Threats
    var nearbyThreats = this.findNearby(cell,this.threats,THREAT_NO);
    for ( var i = 0; i < THREAT_NO; i++){
        if ( nearbyThreats != null && i < nearbyThreats.length ){
            var threatsStateVector = this.getStateVectorFromLocation(cell,nearbyThreats[i]);
            var threatsEnabler = 1;
            var threatMassDifference = this.getMassDifference(cell,nearbyThreats[i]);
            qList.push(threatsEnabler,threatsStateVector.direction/MAX_ANGLE,threatsStateVector.distance/MAX_DISTANCE,threatMassDifference/MAX_MASS_DIFFERENCE);
        }else{
            qList.push(0,0,0,0);
        }
    }

    var actionNumber = this.agent.act(qList);
    this.previousMass = cell.mass;
    var action = this.decodeAction(actionNumber);
    var targetLocation = this.getLocationFromAction(cell, action);
    this.targetPos = {
        x: targetLocation.x,
        y: targetLocation.y
    };
    this.shouldUpdateQNetwork = true;

};

// Finds nearby cells in list
QBot.prototype.findNearby = function(cell, list, count) {
    if ( list.length <= 0 || count == 0){
        return null;
    }

    list.sort(function(a,b){
        return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    });

    var nearby = [];

    for (var i = 0; (i < count) && (i < list.length); i++){
        nearby.push(list[i]);
    }

    return nearby;
};

// Returns distance between two cells
QBot.prototype.getDist = function(cell, check) {

    var dx = Math.abs(check.position.x - cell.position.x);
    var dy = Math.abs(check.position.y - cell.position.y);

    var distance = Math.sqrt(dx*dx + dy*dy) - ((cell.getSize()+check.getSize())/2);
    if (distance < 0){
        distance = 0;
    }
    return distance;
};

QBot.prototype.getAngle = function(c1, c2) {
    var deltaY = c1.position.y - c2.position.y;
    var deltaX = c1.position.x - c2.position.x;
    return Math.atan2(deltaX, deltaY);
};

QBot.prototype.reverseAngle = function(angle) {
    if (angle > Math.PI) {
        angle -= Math.PI;
    } else {
        angle += Math.PI;
    }
    return angle;
};


// ADDED BY ME

// Assign Preys, Threats, Viruses & Foods
QBot.prototype.updateLists = function(cell){
    for (i in this.visibleNodes) {
        var check = this.visibleNodes[i];

        // Cannot target itself
        if ((!check) || (cell.owner == check.owner)) {
            continue;
        }

        var t = check.getType();
        switch (t) {
            case 0:
                // Cannot target teammates
                if (this.gameServer.gameMode.haveTeams) {
                    if (check.owner.team == this.team) {
                        continue;
                    }
                }

                // Check for danger
                if (cell.mass > (check.mass * 1.33)) {
                    // Add to prey list
                    this.prey.push(check);
                    this.allEnemies.push(check);
                } else if (check.mass > (cell.mass * 1.33)) {
                    this.threats.push(check);
                    this.allEnemies.push(check);
                }
                break;
            case 1:
                this.food.push(check);
                break;
            case 2: // Virus
                if (!check.isMotherCell) {
                    this.virus.push(check);
                    this.allEnemies.push(check);
                } // Only real viruses! No mother cells
                break;
            case 3: // Ejected mass
                if (cell.mass > 20) {
                    this.food.push(check);
                }
                break;
            default:
                break;
        }
    }
};

// Returns Direction from Location
QBot.prototype.getDirectionFromLocation = function(cell, check){

    var dy = check.position.y - cell.position.y;
    var dx = check.position.x - cell.position.x;

    var angle = Math.atan2(dx, dy);

    //console.log("Delta X: "+deltaX+"\nDelta Y: "+deltaY+"\nAngle: "+(angle*180/Math.PI));

    //console.log("\tAngle: "+(angle*180/Math.PI));

    var direction;
    if ( angle < 0 )
        angle += 2*Math.PI;


    if ( angle < Math.PI/8 || angle >= (Math.PI*15)/8 ){
        direction = 0;
        //console.log("S");
    }else if ( angle >= (Math.PI)/8 && angle < (Math.PI*3)/8 ){
        direction = (Math.PI*2)/8;
        //console.log("SE");
    }else if ( angle >= (Math.PI*3)/8 && angle < (Math.PI*5)/8 ){
        direction = (Math.PI*4)/8;
        //console.log("E");
    }else if ( angle >= (Math.PI*5)/8 && angle < (Math.PI*7)/8 ){
        direction = (Math.PI*6)/8;
        //console.log("NE");
    }else if ( angle >= (Math.PI*7)/8 && angle < (Math.PI*9)/8 ){
        direction = (Math.PI*8)/8;
        //console.log("N");
    }else if ( angle >= (Math.PI*9)/8 && angle < (Math.PI*11)/8 ){
        direction = (Math.PI*10)/8;
        //console.log("NW");
    }else if ( angle >= (Math.PI*11)/8 && angle < (Math.PI*13)/8 ){
        direction = (Math.PI*12)/8;
        //console.log("W");
    }else if ( angle >= (Math.PI*13)/8 && angle < (Math.PI*15)/8 ){
        direction = (Math.PI*14)/8;
        //console.log("SW");
    }
    if ( direction > Math.PI){
        direction -= 2*Math.PI;
    }
    return direction;
};

// Transforms Distance to Speed
QBot.prototype.getSpeedFromDistance = function(distance){
    var speed;
    if ( distance < 600 ){
        speed = 30;
    }else if ( distance < 1200){
        speed = 90;
    }else{
        speed = 150;
    }
    return speed;
};

// Transforms Speed to Distance
QBot.prototype.getDistanceFromSpeed = function(speed){
    var distance;
    if (speed < 60){
        distance = 300;
    }else if ( speed < 120){
        distance = 900;
    }else{
        distance = 1500;
    }
    return distance;
};

// Returns StateVector type class from the location of two cells
QBot.prototype.getStateVectorFromLocation = function(cell, check){
    var distance = this.getDist(cell,check);
    var direction = this.getDirectionFromLocation(cell, check);
    return new StateVector(direction,distance);
};

// Returns Position type class of an Action type class
QBot.prototype.getLocationFromAction = function(cell, action){
    var direction = action.direction;
    var speed = action.speed;
    var distance = this.getDistanceFromSpeed(speed);
    return new Position(cell.position.x + distance * Math.sin(direction), cell.position.y + distance * Math.cos(direction));
};

// Returns the mass difference of two cells
QBot.prototype.getMassDifference = function(cell, check){
    var dMass = Math.round((cell.mass - check.mass)/10);
    if (dMass > MAX_MASS_DIFFERENCE)
        dMass = MAX_MASS_DIFFERENCE;
    else if (dMass < -MAX_MASS_DIFFERENCE)
        dMass = -MAX_MASS_DIFFERENCE;
    //console.log(dMass);
    return dMass;
};

// Encode - Decode DQN Values
QBot.prototype.decodeAction = function(q){
    var speed;
    var direction;
    switch (q%3){
        case 0:
            speed = 30;
            break;
        case 1:
            speed = 90;
            break;
        case 2:
            speed = 150;
            break;
        default :
            break;
    }
    direction = ((Math.PI)/4)*(q%8);
    if ( direction > Math.PI){
        direction -= 2*Math.PI;
    }
    // console.log("Action: \n\tDirection: "+direction+"\n\tSpeed: "+speed);
    return new Action(direction, speed);
};

// Necessary Classes

// It shows the action of a cell with direction and speed.
function Action(direction, speed){
    this.direction = direction;
    this.speed = speed;
};

// It shows the state of a cell according to other cell with direction and distance
function StateVector(direction, distance){
    this.direction = direction;
    this.distance = distance;
};

// A position class with X and Y
function Position(x, y){
    this.x = x;
    this.y = y;
}
