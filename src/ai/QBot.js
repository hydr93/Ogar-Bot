/**
 * Created by hydr93 on 09/03/16.
 */

var PlayerTracker = require('../PlayerTracker');
var gameServer = require('../GameServer');

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

    this.state = new State;
    this.action = new Action;

    this.previousMass = 10;
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
    }

    // Calculate nodes
    this.visibleNodes = this.calcViewBox();

    // Get Lowest cell of the bot
    var cell = this.getLowestCell();
    var r = cell.getSize();
    this.clearLists();

    // Assign Preys, Threats, Viruses & Foods
    this.updateLists(cell);



    //// Get gamestate
    //var newState = this.getState(cell);
    //if ((newState != this.gameState) && (newState != 4)) {
    //    // Clear target
    //    this.target = null;
    //}
    //this.gameState = newState;

    // Action
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

QBot.prototype.updatePrey = function(cell) {
    // Recalculate prey
    this.prey = [];
    for (var i in this.visibleNodes) {
        var check = this.visibleNodes[i];
        if (check.cellType == 0 && cell.mass > (check.mass * 1.33) && check.mass > cell.mass / 5) {
            // Prey
            this.prey.push(check);
        }
    }
};

QBot.prototype.shouldUpdateNodes = function() {
    if ((this.tickViewBox <= 0) && (this.gameServer.run)) {
        this.visibleNodes = this.calcViewBox();
        this.tickViewBox = 6;
    } else {
        this.tickViewBox--;
        return;
    }
};

QBot.prototype.clearLists = function() {
    this.allEnemies = [];
    this.threats = [];
    this.prey = [];
    this.food = [];
    this.virus = [];
};

QBot.prototype.getGameState = function(cell) {
    var state;

    if ( this.food.length > 0 ){
        if ( this.allEnemies.length > 0){
            state = 0;
        }else{
            state = 1;
        }
    }else{
        state = 2;
    }

    return state;
};

QBot.prototype.decide = function(cell) {
    var foodDirection,foodDistance,enemyDirection,enemyDistance,enemyMassDifference;
    var actionDirection, actionSpeed;

    var gameState = this.getGameState(cell);

    switch ( gameState ){
        case 0:
            console.log("Q-Learning");
            //var nearestThreat = this.findNearest(cell, this.threats);
            //var nearestPrey = this.findNearest(cell, this.prey);
            var nearestVirus = this.findNearest(cell, this.virus);

            //var nearestEnemy = this.findNearest(cell, this.allEnemies);
            var nearestFood = this.findNearest(cell, this.food);


            break;
        case 1:
            console.log("Nearest Food");
            var nearestFood = this.findNearest(cell, this.food);

            // Set bot's mouse coords to this location
            this.targetPos = {
                x: nearestFood.position.x,
                y: nearestFood.position.y
            };
            break;
        case 2:
            // Random??
        default:
            // Random right now
            console.log("Random");
            var action = this.getRandomAction();
            var targetLocation = this.getLocationFromAction(cell, action)
            this.targetPos = {
                x: targetLocation.x,
                y: targetLocation.y
            };
            break;
    }

};

// Finds the nearest cell in list
QBot.prototype.findNearest = function(cell, list) {
    if ( list.length <= 0 ){
        return null;
    }
    // Check for nearest cell in list
    var shortest = list[0];
    var shortestDist = this.getDist(cell, shortest);
    for (var i = 1; i < list.length; i++) {
        var check = list[i];
        var dist = this.getDist(cell, check);
        if (shortestDist > dist) {
            shortest = check;
            shortestDist = dist;
        }
    }

    return shortest;
};


QBot.prototype.findNearbyVirus = function(cell, checkDist, list) {
    var r = cell.getSize() + 100; // Gets radius + virus radius
    for (var i = 0; i < list.length; i++) {
        var check = list[i];
        var dist = this.getDist(cell, check) - r;
        if (checkDist > dist) {
            return check;
        }
    }
    return false; // Returns a bool if no nearby viruses are found
};

QBot.prototype.getDist = function(cell, check) {
    // Fastest distance - I have a crappy computer to test with :(
    var xd = (check.position.x - cell.position.x);
    xd = xd < 0 ? xd * -1 : xd; // Math.abs is slow

    var yd = (check.position.y - cell.position.y);
    yd = yd < 0 ? yd * -1 : yd; // Math.abs is slow

    return (xd + yd);
};

QBot.prototype.getAccDist = function(cell, check) {
    // Accurate Distance
    var xs = check.position.x - cell.position.x;
    xs = xs * xs;

    var ys = check.position.y - cell.position.y;
    ys = ys * ys;

    return Math.sqrt(xs + ys);
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

QBot.prototype.getDirectionFromLocation = function(cell, check){

    var deltaY = cell.position.y - check.position.y;
    var deltaX = cell.position.x - check.position.x;

    var angle = Math.atan2(deltaY, deltaX);

    //console.log("Delta X: "+deltaX+"\nDelta Y: "+deltaY+"\nAngle: "+(angle*180/Math.PI));

    var direction;
    if ( angle < 0 )
        angle += 2*Math.PI;


    if ( angle < Math.PI/8 || angle >= (Math.PI*15)/8 ){
        direction = 0;
        //console.log("E");
    }else if ( angle >= (Math.PI)/8 && angle < (Math.PI*3)/8 ){
        direction = (Math.PI*2)/8;
        //console.log("NE");
    }else if ( angle >= (Math.PI*3)/8 && angle < (Math.PI*5)/8 ){
        direction = (Math.PI*4)/8;
        //console.log("N");
    }else if ( angle >= (Math.PI*5)/8 && angle < (Math.PI*7)/8 ){
        direction = (Math.PI*6)/8;
        //console.log("NW");
    }else if ( angle >= (Math.PI*7)/8 && angle < (Math.PI*9)/8 ){
        direction = (Math.PI*8)/8;
        //console.log("W");
    }else if ( angle >= (Math.PI*9)/8 && angle < (Math.PI*11)/8 ){
        direction = (Math.PI*10)/8;
        //console.log("SW");
    }else if ( angle >= (Math.PI*11)/8 && angle < (Math.PI*13)/8 ){
        direction = (Math.PI*12)/8;
        //console.log("S");
    }else if ( angle >= (Math.PI*13)/8 && angle < (Math.PI*15)/8 ){
        direction = (Math.PI*14)/8;
        //console.log("SE");
    }
    if ( direction > Math.PI){
        direction -= 2*Math.PI;
    }
    return direction;
};

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

QBot.prototype.getActionFromLocation = function(cell, check){
    var distance = this.getDist(cell,check);
    var speed = this.getSpeedFromDistance(distance);
    var direction = this.getDirectionFromLocation(cell, check);

    return new Action(direction,speed);
};


QBot.prototype.getLocationFromAction = function(cell, action){
    var direction = action.direction;
    var speed = action.speed;
    var distance = this.getDistanceFromSpeed(speed);
    return new Position(cell.position.x + distance * Math.sin(direction), cell.position.y + distance * Math.cos(direction));
};

QBot.prototype.getMassDifference = function(cell, check){
    var dMass = Math.round((cell.mass - check.mass)/10);
    //console.log(dMass);
    return dMass;
};

QBot.prototype.getRandomAction = function(){

    var angle = 2*Math.PI*Math.random();
    if ( angle > Math.PI){
        angle -= 2*Math.PI;
    }
    var speed = 150*Math.random();
    return new Action(angle,speed);
};

// Q-Learning
QBot.prototype.qFunction = function(cell, state, action){
    var reward = cell.mass - this.previousMass;
};

// Necessary Classes

function Action(direction, speed){
    this.direction = direction;
    this.speed = speed;
};

function State(foodDirection, foodDistance, enemyDirection, enemyDistance, enemyMassDifference) {
    this.foodDirection = foodDirection;
    this.foodDistance = foodDistance;
    this.enemyDirection = enemyDirection;
    this.enemyDistance = enemyDistance;
    this.enemyMassDifference = enemyMassDifference;
};

function Position(x, y){
    this.x = x;
    this.y = y;
}
