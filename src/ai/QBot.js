/**
 * Created by hydr93 on 09/03/16.
 */

var PlayerTracker = require('../PlayerTracker');
var gameServer = require('../GameServer');
var CommandList = require("../modules/CommandList");

var Reinforce = require("Reinforcejs");

var fs = require("fs");
const JSON_FILE = "/Users/hydr93/Developer/GitHub/Ogar-Bot/src/ai/json";

const REPORT_FILE = "/Users/hydr93/Developer/GitHub/Ogar-Bot/reports/report12.txt";

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
const MAX_MASS_DIFFERENCE_RATIO = 20;

//const FOOD_NO = 1;
//const VIRUS_NO = 0;
//const THREAT_NO = 0;
//const PREY_NO = 0;

const MAX_CELL_IN_DIRECTION = 1;
const DIRECTION_COUNT = 8;

function QBot() {
    PlayerTracker.apply(this, Array.prototype.slice.call(arguments));
    //this.color = gameServer.getRandomColor();

    // AI only

    //this.threats = []; // List of cells that can eat this bot but are too far away
    //this.prey = []; // List of cells that can be eaten by this bot
    //this.food = [];
    //this.virus = []; // List of viruses
    this.directionArray = [];
    for ( var i = 0 ; i < DIRECTION_COUNT ; i++) {
        this.directionArray.push([]);
    }

    this.targetPos = {
        x: 0,
        y: 0
    };

    this.previousMass = 10.0;
    this.previousLenght = 1;

    // Initialize DQN Environment
    var env = {};
    env.getNumStates = function() { return 2+(3*DIRECTION_COUNT);};
    env.getMaxNumActions = function() {return 24;};
    var spec = {
        update: 'qlearn',
        gamma: 0.9,
        epsilon: 0.2,
        alpha: 0.005,
        experience_add_every: 5,
        experience_size: 10000,
        learning_steps_per_iteration: 5,
        tderror_clamp: 1.0,
        num_hidden_units: 100,
        activation_function: 3
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
    fs.appendFile(REPORT_FILE, "Test 12:\n\nNumber of States: "+env.getNumStates()+"\nNumber of Actions: "+env.getMaxNumActions()+"\nNumber of Hidden Units: "+spec.num_hidden_units+"\n");
    var date = new Date();
    fs.appendFile(REPORT_FILE, "\nStates:\n\t"+ DIRECTION_COUNT +" Directions\n\t\tEnabler\n\t\tDirection\n\t\tSize Difference\nActions:\n\tWalk\n\t\t8 Directions\n\t\t3 Speed\n");
    fs.appendFile(REPORT_FILE, "\nTrial Reset Mass: "+TRIAL_RESET_MASS+"\n");
    fs.appendFile(REPORT_FILE, "\nTrial No: "+ trial++ +"\n\tBirth: "+date+"\n");

    this.shouldUpdateQNetwork = false;
}

module.exports = QBot;
QBot.prototype = new PlayerTracker();

// Functions

// Returns the lowest cell of the player
QBot.prototype.getBiggestCell = function() {
    // Gets the cell with the lowest mass
    if (this.cells.length <= 0) {
        return null; // Error!
    }

    // Sort the cells by Array.sort() function to avoid errors
    var sorted = this.cells.valueOf();
    sorted.sort(function(a, b) {
        return b.mass - a.mass;
    });

    return sorted[0];
};


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

        //this.agent.learn(-1);
        //this.shouldUpdateQNetwork = false;
        //var json = this.agent.toJSON();
        //fs.writeFile(JSON_FILE, JSON.stringify(json, null, 4));

        // CommandList.list.killall(this.gameServer,0);
        // var date = new Date();
        //// Report the important information to REPORT_FILE
        // fs.appendFile(REPORT_FILE, "\tDeath: "+date+" with Size: "+this.previousMass+"\n");

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

    // Get Lowest cell of the bot
    var cell = this.getBiggestCell();
    var r = cell.getSize();
    this.clearLists();


    // Assign Preys, Threats, Viruses & Foods
    this.updateLists(cell);
    this.sortLists(cell);

    // Action
    if ( this.shouldUpdateQNetwork ){

        this.agent.learn(this.reward());
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
    //this.threats = [];
    //this.prey = [];
    //this.food = [];
    //this.virus = [];
    for ( var i = 0 ; i < this.directionArray.length ; i++ ) {
        this.directionArray[i] = [];
    }
};


//Decides the action of player
QBot.prototype.decide = function(cell){

    var qList = [cell.position.x/6000, cell.position.y/6000];
    for ( var j = 0 ; j < this.directionArray.length ; j++){
        if ( this.directionArray[i] != null && this.directionArray[i].length > 0){
            var nearby = this.findNearby(cell, this.directionArray[i], MAX_CELL_IN_DIRECTION);
            for ( var i = 0; i < MAX_CELL_IN_DIRECTION; i++){
                if ( nearby != null && i < nearby.length){
                    var distance = this.getDist(cell, nearby[i]);
                    var massDifference = this.getMassDifferenceRatio(cell, nearby[i]);
                    var enabler = 1;
                    qList.push(enabler, 1-(distance/MAX_DISTANCE), massDifference/MAX_MASS_DIFFERENCE_RATIO);
                }else{
                    qList.push(-1,-1,0);
                }
            }
        }else{
            qList.push(-1,-1,0);
        }
    }

    //// Find Nearby N Foods
    //var nearbyFoods = this.findNearby(cell,this.food,FOOD_NO);
    //var qList = [];
    //for ( var i = 0; i < FOOD_NO; i++){
    //    if ( nearbyFoods != null && i < nearbyFoods.length ){
    //        var foodStateVector = this.getStateVectorFromLocation(cell,nearbyFoods[i]);
    //        var foodEnabler = 1;
    //        qList.push(foodEnabler,(((foodStateVector.direction/MAX_ANGLE)+1)/2.0),(foodStateVector.distance/MAX_DISTANCE));
    //    }else{
    //        qList.push(-1,-1,-1);
    //    }
    //}
    //
    //// Find Nearby N Viruses
    //var nearbyViruses = this.findNearby(cell,this.virus,VIRUS_NO);
    //for ( var i = 0; i < VIRUS_NO; i++){
    //    if ( nearbyViruses != null && i < nearbyViruses.length){
    //        var virusStateVector = this.getStateVectorFromLocation(cell,nearbyViruses[i]);
    //        var virusEnabler = 1;
    //        qList.push(virusEnabler,(((virusStateVector.direction/MAX_ANGLE)+1)/2.0),virusStateVector.distance/MAX_DISTANCE,  this.compareCellWithVirus(cell,nearbyViruses[i]));
    //    }else{
    //        qList.push(-1,-1,-1,0);
    //    }
    //}
    //
    //// Find Nearby N Preys
    //var nearbyPreys = this.findNearby(cell,this.prey,PREY_NO);
    //for ( var i = 0; i < PREY_NO; i++){
    //    if ( nearbyPreys != null && i < nearbyPreys.length ){
    //        var preyStateVector = this.getStateVectorFromLocation(cell,nearbyPreys[i]);
    //        var preyEnabler = 1;
    //        var preyMassDifference = this.getMassDifference(cell,nearbyPreys[i]);
    //        qList.push(preyEnabler,(((preyStateVector.direction/MAX_ANGLE)+1)/2.0),preyStateVector.distance/MAX_DISTANCE,preyMassDifference/MAX_MASS_DIFFERENCE);
    //    }else{
    //        qList.push(-1,-1,-1,0);
    //    }
    //}
    //
    //// Find Nearby N Threats
    //var nearbyThreats = this.findNearby(cell,this.threats,THREAT_NO);
    //for ( var i = 0; i < THREAT_NO; i++){
    //    if ( nearbyThreats != null && i < nearbyThreats.length ){
    //        var threatsStateVector = this.getStateVectorFromLocation(cell,nearbyThreats[i]);
    //        var threatsEnabler = 1;
    //        var threatMassDifference = this.getMassDifference(cell,nearbyThreats[i]);
    //        qList.push(threatsEnabler,(((threatsStateVector.direction/MAX_ANGLE)+1)/2.0),threatsStateVector.distance/MAX_DISTANCE,threatMassDifference/MAX_MASS_DIFFERENCE);
    //    }else{
    //        qList.push(-1,-1,-1,0);
    //    }
    //}

    var actionNumber = this.agent.act(qList);

    var totalMass = 0;
    for ( var i = 0 ; i < this.cells.length ; i++)
        totalMass += this.cells[i].mass;

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

    //list.sort(function(a,b){
    //    return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    //});

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

        this.splitToDirectionArray(cell, check);

        //var t = check.getType();
        //switch (t) {
        //    case 0:
        //        // Cannot target teammates
        //        if (this.gameServer.gameMode.haveTeams) {
        //            if (check.owner.team == this.team) {
        //                continue;
        //            }
        //        }
        //
        //        // Check for danger
        //        if (cell.mass > (check.mass * 1.33)) {
        //            // Add to prey list
        //            this.prey.push(check);
        //        } else if (check.mass > (cell.mass * 1.33)) {
        //            this.threats.push(check);
        //        }
        //        break;
        //    case 1:
        //        this.food.push(check);
        //        break;
        //    case 2: // Virus
        //        if (!check.isMotherCell) {
        //            this.virus.push(check);
        //        } // Only real viruses! No mother cells
        //        break;
        //    case 3: // Ejected mass
        //        if (cell.mass > 20) {
        //            this.food.push(check);
        //        }
        //        break;
        //    default:
        //        break;
        //}
    }
};

QBot.prototype.sortLists = function(cell){
    //this.food.sort(function(a,b){
    //    return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    //});
    //this.prey.sort(function(a,b){
    //    return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    //});
    //this.threats.sort(function(a,b){
    //    return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    //});
    //this.virus.sort(function(a,b){
    //    return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
    //});

    for ( var i = 0 ; i < this.directionArray.length ; i++){
        this.directionArray[i].sort(function(a,b){
            return QBot.prototype.getDist(cell,a) - QBot.prototype.getDist(cell,b);
        });
    }

};

QBot.prototype.splitToDirectionArray = function (cell, check){
    var dy = check.position.y - cell.position.y;
    var dx = check.position.x - cell.position.x;

    var angle = Math.atan2(dx, dy);

    var direction;
    if ( angle < 0 )
        angle += 2*Math.PI;


    if ( angle < Math.PI/8 || angle >= (Math.PI*15)/8 ){
        this.directionArray[4].push(check);
        //console.log("S");
    }else if ( angle >= (Math.PI)/8 && angle < (Math.PI*3)/8 ){
        this.directionArray[3].push(check);
        //console.log("SE");
    }else if ( angle >= (Math.PI*3)/8 && angle < (Math.PI*5)/8 ){
        this.directionArray[2].push(check);
        //console.log("E");
    }else if ( angle >= (Math.PI*5)/8 && angle < (Math.PI*7)/8 ){
        this.directionArray[1].push(check);
        //console.log("NE");
    }else if ( angle >= (Math.PI*7)/8 && angle < (Math.PI*9)/8 ){
        this.directionArray[0].push(check);
        //console.log("N");
    }else if ( angle >= (Math.PI*9)/8 && angle < (Math.PI*11)/8 ){
        this.directionArray[7].push(check);
        //console.log("NW");
    }else if ( angle >= (Math.PI*11)/8 && angle < (Math.PI*13)/8 ){
        this.directionArray[6].push(check);
        //console.log("W");
    }else if ( angle >= (Math.PI*13)/8 && angle < (Math.PI*15)/8 ){
        this.directionArray[5].push(check);
        //console.log("SW");
    }
    return;
};

//// Returns Direction from Location
//QBot.prototype.getDirectionFromLocation = function(cell, check){
//
//    var dy = check.position.y - cell.position.y;
//    var dx = check.position.x - cell.position.x;
//
//    var angle = Math.atan2(dx, dy);
//
//    //console.log("Delta X: "+deltaX+"\nDelta Y: "+deltaY+"\nAngle: "+(angle*180/Math.PI));
//
//    //console.log("\tAngle: "+(angle*180/Math.PI));
//
//    var direction;
//    if ( angle < 0 )
//        angle += 2*Math.PI;
//
//
//    if ( angle < Math.PI/8 || angle >= (Math.PI*15)/8 ){
//        direction = 0;
//        //console.log("S");
//    }else if ( angle >= (Math.PI)/8 && angle < (Math.PI*3)/8 ){
//        direction = (Math.PI*2)/8;
//        //console.log("SE");
//    }else if ( angle >= (Math.PI*3)/8 && angle < (Math.PI*5)/8 ){
//        direction = (Math.PI*4)/8;
//        //console.log("E");
//    }else if ( angle >= (Math.PI*5)/8 && angle < (Math.PI*7)/8 ){
//        direction = (Math.PI*6)/8;
//        //console.log("NE");
//    }else if ( angle >= (Math.PI*7)/8 && angle < (Math.PI*9)/8 ){
//        direction = (Math.PI*8)/8;
//        //console.log("N");
//    }else if ( angle >= (Math.PI*9)/8 && angle < (Math.PI*11)/8 ){
//        direction = (Math.PI*10)/8;
//        //console.log("NW");
//    }else if ( angle >= (Math.PI*11)/8 && angle < (Math.PI*13)/8 ){
//        direction = (Math.PI*12)/8;
//        //console.log("W");
//    }else if ( angle >= (Math.PI*13)/8 && angle < (Math.PI*15)/8 ){
//        direction = (Math.PI*14)/8;
//        //console.log("SW");
//    }
//    if ( direction > Math.PI){
//        direction -= 2*Math.PI;
//    }
//    return direction;
//};

//// Transforms Distance to Speed
//QBot.prototype.getSpeedFromDistance = function(distance){
//    var speed;
//    if ( distance < 600 ){
//        speed = 30;
//    }else if ( distance < 1200){
//        speed = 90;
//    }else{
//        speed = 150;
//    }
//    return speed;
//};

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

//// Returns StateVector type class from the location of two cells
//QBot.prototype.getStateVectorFromLocation = function(cell, check){
//    var distance = this.getDist(cell,check);
//    var direction = this.getDirectionFromLocation(cell, check);
//    return new StateVector(direction,distance);
//};

// Returns Position type class of an Action type class
QBot.prototype.getLocationFromAction = function(cell, action){
    var direction = action.direction;
    var speed = action.speed;
    var distance = this.getDistanceFromSpeed(speed);
    return new Position(cell.position.x + distance * Math.sin(direction), cell.position.y + distance * Math.cos(direction));
};

//QBot.prototype.compareCellWithVirus = function(cell, virus){
//    if (cell.mass * 1.33 > virus.mass)
//        return 1;
//    else
//        return 0;
//};

// Returns the mass difference of two cells
QBot.prototype.getMassDifferenceRatio = function(cell, check){
    var dMass = cell.mass/check.mass;
    if (dMass > MAX_MASS_DIFFERENCE_RATIO)
        dMass = MAX_MASS_DIFFERENCE_RATIO;
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

QBot.prototype.reward = function (){

    //var reward = (totalMass - this.previousMass)/Math.max(totalMass, this.previousMass) + (this.previousLenght - this.cells.length)/Math.max(this.previousLenght, this.cells.length);
    //if ( reward > 1 )
    //    reward = 1;
    //else if (reward < -1)
    //    reward = -1;

    //this.previousLenght = this.cells.length;

    var currentMass = 0;
    for ( var i = 0 ; i < this.cells.length ; i++){
        currentMass += this.cells[i].mass;
    }
    var result = currentMass - this.previousMass;
    this.previousMass = currentMass;
    return result;
}

// Necessary Classes

// It shows the action of a cell with direction and speed.
function Action(direction, speed){
    this.direction = direction;
    this.speed = speed;
};

//// It shows the state of a cell according to other cell with direction and distance
//function StateVector(direction, distance){
//    this.direction = direction;
//    this.distance = distance;
//};

// A position class with X and Y
function Position(x, y){
    this.x = x;
    this.y = y;
}
