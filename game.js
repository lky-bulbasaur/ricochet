var Victor = require('victor');
var { parentPort } = require('worker_threads');

// Constants
const TICK_INTERVAL = 16;
const TIMESCALE = 1;
const MULTIPLIER = TICK_INTERVAL / 1000 * TIMESCALE;
const BIG = 10000;
const WIN_KILL_COUNT = 10;

var PLAYER_MOVE_SPEED = 240;
var PLAYER_FIRE_RATE = 10;
var PLAYER_CLIP = 25;
var PLAYER_SPARE_AMMO = 40;
var PROJECTILE_MOVE_SPEED = 800;
var PROJECTILE_DAMAGE = 3;

// Global variables
var collisionNormal, collisionPos;
var projectileId = 0;

// Math utility functions
function abs(x) {
    if (x < 0) {
        return -x;
    }
    return x;
}

function min(a, b) {
    if (a < b) {
        return a;
    } else {
        return b;
    }
}

function max(a, b) {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}

// Functions for collision detection
// Intersection test & volume sweeping are used
function solveCircleLineIntersection(circlePos, circleRadius, lineStart, lineEnd, velocity) {
    // Defines the equation of circlePos's trajectory in terms of y = mx + c
    var traj_m = (velocity.y) / (velocity.x);
    if (velocity.x == 0) {
        traj_m = BIG;
    }
    var traj_c = -traj_m * circlePos.x + circlePos.y;

    // Defines the equation of the line in terms of y = mx + c
    var line_m = (lineEnd.y - lineStart.y) / (lineEnd.x - lineStart.x);

    if (lineEnd.x - lineStart.x == 0) {
        line_m = BIG;
    }

    var line1_c = -line_m * lineStart.x + lineStart.y + circleRadius;
    var line2_c = -line_m * lineStart.x + lineStart.y - circleRadius;
    if (line_m == BIG) {
        line1_c = -line_m * (lineStart.x + circleRadius) + lineStart.y;
        line2_c = -line_m * (lineStart.x - circleRadius) + lineStart.y;
    } else if (abs(line_m) > 1) {
        line1_c = -line_m * lineStart.x + lineStart.y + circleRadius * line_m;
        line2_c = -line_m * lineStart.x + lineStart.y - circleRadius * line_m;
    }

    var A, B, C, det, tangent;           // Terms to be used in solving quadratic equations for x
    var result = null;          // Updated when the closest attainable collision is found
    var curLength = BIG;

    // Check circlePos's trajectory's intersection with the "head" circle
    A = traj_m ** 2 + 1;
    B = 2 * (traj_m * traj_c - traj_m * lineStart.y - lineStart.x);
    C = lineStart.y ** 2 - circleRadius ** 2 + lineStart.x ** 2 - 2 * traj_c * lineStart.y + traj_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var x2 = (-B - det ** 0.5) / (2 * A);
        var y1 = traj_m * x1 + traj_c;
        var y2 = traj_m * x2 + traj_c;

        var pos1 = new Victor(x1, y1);
        var pos2 = new Victor(x2, y2);
        var temp1 = pos1.clone().subtract(circlePos).length();
        var temp2 = pos2.clone().subtract(circlePos).length();

        if (temp1 < temp2) {
            if (temp1 < curLength) {
                if (temp1 <= velocity.length()) {
                    result = pos1;
                    curLength = temp1;
                    tangent = (lineStart.x - x1) / (y1 - lineStart.y);
                }
            }
        } else {
            if (temp2 < curLength) {
                if (temp2 <= velocity.length()) {
                    result = pos2;
                    curLength = temp2;
                    tangent = (lineStart.x - x2) / (y2 - lineStart.y);
                }
            }
        }
    }

    // Check circlePos's trajectory's intersection with the "tail" circle
    A = traj_m ** 2 + 1;
    B = 2 * (traj_m * traj_c - traj_m * lineEnd.y - lineEnd.x);
    C = lineEnd.y ** 2 - circleRadius ** 2 + lineEnd.x ** 2 - 2 * traj_c * lineEnd.y + traj_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var x2 = (-B - det ** 0.5) / (2 * A);
        var y1 = traj_m * x1 + traj_c;
        var y2 = traj_m * x2 + traj_c;

        var pos1 = new Victor(x1, y1);
        var pos2 = new Victor(x2, y2);
        var temp1 = pos1.clone().subtract(circlePos).length();
        var temp2 = pos2.clone().subtract(circlePos).length();

        if (temp1 < temp2) {
            if (temp1 < curLength) {
                if (temp1 <= velocity.length()) {
                    result = pos1;
                    curLength = temp1;
                    tangent = (lineEnd.x - x1) / (y1 - lineEnd.y);
                }
            }
        } else {
            if (temp2 < curLength) {
                if (temp2 <= velocity.length()) {
                    result = pos2;
                    curLength = temp2;
                    tangent = (lineEnd.x - x2) / (y2 - lineEnd.y);
                }
            }
        }
    }

    // Check circlePos's trajectory's intersection with the first parallel line
    var line1_p1 = new Victor(0, 0);
    var line1_p2 = new Victor(0, 0);
    A = line_m ** 2 + 1;
    B = 2 * (line_m * line1_c - line_m * lineStart.y - lineStart.x);
    C = lineStart.y ** 2 - circleRadius ** 2 + lineStart.x ** 2 - 2 * line1_c * lineStart.y + line1_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (line_m == BIG) det = -det;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var y1 = line_m * x1 + line1_c;

        line1_p1 = new Victor(x1, y1);
    }
    A = line_m ** 2 + 1;
    B = 2 * (line_m * line1_c - line_m * lineEnd.y - lineEnd.x);
    C = lineEnd.y ** 2 - circleRadius ** 2 + lineEnd.x ** 2 - 2 * line1_c * lineEnd.y + line1_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (line_m == BIG) det = -det;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var y1 = line_m * x1 + line1_c;

        line1_p2 = new Victor(x1, y1);
    }
    var line1_lx = min(line1_p1.x, line1_p2.x);
    var line1_ux = max(line1_p1.x, line1_p2.x);
    var line1_ly = min(line1_p1.y, line1_p2.y);
    var line1_uy = max(line1_p1.y, line1_p2.y);
    var x1 = (line1_c - traj_c) / (traj_m - line_m);
    var y1 = line_m * x1 + line1_c;
    if ((x1 >= line1_lx) && (x1 <= line1_ux) && (y1 >= line1_ly) && (y1 <= line1_uy)) {
        var pos = new Victor(x1, y1);
        var temp = pos.clone().subtract(circlePos).length();
        if (temp < curLength) {
            if (temp <= velocity.length()) {
                result = pos;
                curLength = temp;
                tangent = line_m;
            }
        }
    }

    // Check circlePos's trajectory's intersection with the second parallel line
    var line2_p1 = new Victor(0, 0);
    var line2_p2 = new Victor(0, 0);
    A = line_m ** 2 + 1;
    B = 2 * (line_m * line2_c - line_m * lineStart.y - lineStart.x);
    C = lineStart.y ** 2 - circleRadius ** 2 + lineStart.x ** 2 - 2 * line2_c * lineStart.y + line2_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var y1 = line_m * x1 + line2_c;

        line2_p1 = new Victor(x1, y1);
    }
    A = line_m ** 2 + 1;
    B = 2 * (line_m * line2_c - line_m * lineEnd.y - lineEnd.x);
    C = lineEnd.y ** 2 - circleRadius ** 2 + lineEnd.x ** 2 - 2 * line2_c * lineEnd.y + line2_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var y1 = line_m * x1 + line2_c;

        line2_p2 = new Victor(x1, y1);
    }
    var line2_lx = min(line2_p1.x, line2_p2.x);
    var line2_ux = max(line2_p1.x, line2_p2.x);
    var line2_ly = min(line2_p1.y, line2_p2.y);
    var line2_uy = max(line2_p1.y, line2_p2.y);
    var x2 = (line2_c - traj_c) / (traj_m - line_m);
    var y2 = line_m * x2 + line2_c;
    if ((x2 >= line2_lx) && (x2 <= line2_ux) && (y2 >= line2_ly) && (y2 <= line2_uy)) {
        var pos = new Victor(x2, y2);
        var temp = pos.clone().subtract(circlePos).length();
        if (temp < curLength) {
            if (temp <= velocity.length()) {
                result = pos;
                curLength = temp;
                tangent = line_m;
            }
        }
    }

    // Return the closest position and normal
    collisionPos = result;
    if (result != null) {
        collisionPos = collisionPos.subtract(velocity);
        collisionNormal = -1 / tangent;
        if (tangent == 0) collisionNormal = BIG;
    } else {
        collisionNormal = null;
    }
}

function solveCircleCircleIntersection(circle1Pos, circle1Radius, circle2Pos, circle2Radius, velocity) {
    // Defines the equation of circlePos's trajectory in terms of y = mx + c
    var traj_m = (velocity.y) / (velocity.x);
    if (velocity.x == 0) {
        traj_m = BIG;
    }
    var traj_c = -traj_m * circle1Pos.x + circle1Pos.y;

    var A, B, C, det, tangent;           // Terms to be used in solving quadratic equations for x
    var result = null;          // Updated when the closest attainable collision is found
    var curLength = BIG;

    // Check circlePos's trajectory's intersection with circle 2
    A = traj_m ** 2 + 1;
    B = 2 * (traj_m * traj_c - traj_m * circle2Pos.y - circle2Pos.x);
    C = circle2Pos.y ** 2 - (circle1Radius + circle2Radius) ** 2 + circle2Pos.x ** 2 - 2 * traj_c * circle2Pos.y + traj_c ** 2;
    det = B ** 2 - 4 * A * C;
    if (det >= 0) {
        var x1 = (-B + det ** 0.5) / (2 * A);
        var x2 = (-B - det ** 0.5) / (2 * A);
        var y1 = traj_m * x1 + traj_c;
        var y2 = traj_m * x2 + traj_c;

        var pos1 = new Victor(x1, y1);
        var pos2 = new Victor(x2, y2);
        var temp1 = pos1.clone().subtract(circle1Pos).length();
        var temp2 = pos2.clone().subtract(circle1Pos).length();

        if (temp1 < temp2) {
            if (temp1 < curLength) {
                if (temp1 <= velocity.length()) {
                    result = pos1;
                    curLength = temp1;
                    tangent = (circle2Pos.x - x1) / (y1 - circle2Pos.y);
                }
            }
        } else {
            if (temp2 < curLength) {
                if (temp2 <= velocity.length()) {
                    result = pos2;
                    curLength = temp2;
                    tangent = (circle2Pos.x - x2) / (y2 - circle2Pos.y);
                }
            }
        }
    }

    collisionPos = result;
    if (result != null) {
        collisionPos = collisionPos.subtract(velocity);
        collisionNormal = -1 / tangent;
        if (tangent == 0) collisionNormal = BIG;
    } else {
        collisionNormal = null;
    }
}

// Game utility functions
function initPlayerPosition(player) {
    switch (player) {
        case 0:
            game.players[player].pos.x = 200;
            game.players[player].pos.y = 700;
            break;
        case 1:
            game.players[player].pos.x = 700;
            game.players[player].pos.y = 200;
            break;
        case 2:
            game.players[player].pos.x = 200;
            game.players[player].pos.y = 200;
            break;
        case 3:
            game.players[player].pos.x = 700;
            game.players[player].pos.y = 700;
            break;
        default:
            break;
    }
}

// The "Game" class stores the state of the game
// Handles the communication of game state between the cilent and the server
class Game {
    constructor() {
        this.map = new Map();
        this.players = [];
        this.projectiles = null;
        this.currentPlayer = 0;
    }

    setCurrentPlayer(index) {
        this.currentPlayer = index;
    }

    render() {
        var data = '';

        // Summarizes all player data
        var list = this.players;
        if (list != null) for (var i = 0; i < list.length; ++i) {
            data += (list[i].name + ' ' + list[i].pos.x + ' ' + list[i].pos.y + ' ' + list[i].dir + ' ' + list[i].armor.maxHealth + ' ' + list[i].armor.health + ' '
                + list[i].weapon.clip + ' ' + list[i].weapon.spareAmmo + ' ' + list[i].isAlive + ' ' + list[i].isMoving + ' ' + list[i].isFiring + ' ' + list[i].weapon.isReloading + ' '
                + list[i].killCount + ' ' + list[i].deathCount);
            if (i != list.length) {
                data += ';';
            }
        }

        data += '|';
        list = this.map.planes;
        if (list != null) for (var i = 0; i < list.length; i += 2) {
            data += (list[i].x + ' ' + list[i].y + ' ' + list[i + 1].x + ' ' + list[i + 1].y);
            if (i != list.length) {
                data += ';';
            }
        }

        data += '|';
        list = this.map.projectiles;
        if (list != null) for (var i = 0; i < list.length; ++i) {
            if (list[i] != null) {
                data += (list[i].player + ' ' + list[i].pos.x + ' ' + list[i].pos.y + ' ' + list[i].radius);
                if (i != list.length) {
                    data += ';';
                }
            }
        }

        data += '|';
        list = this.map.powerups;
        if (list != null) for (var i = 0; i < list.length; ++i) {
            if (list[i] != null) {
                data += (list[i].type + ' ' + list[i].pos.x + ' ' + list[i].pos.y + ' ' + list[i].isAlive);
                if (i != list.length) {
                    data += ';';
                }
            }
        }

        parentPort.postMessage(data);
    }

    playSound(sound, x, y) {
        parentPort.postMessage('audio ' + sound + ' ' + x + ' ' + y);
    }
}

// The "Map" class stores the state of the map
// Including planes that define the terrain of the arena (akin to bounding volumes),
// the location of powerups, and all projectiles existing in the game
class Map {
    constructor() {
        this.width = 900;
        this.height = 900;
        this.planes = [
            new Victor(700, 0), new Victor(900, 200),
            new Victor(0, 200), new Victor(0, 700),
            new Victor(0, 700), new Victor(200, 900),
            new Victor(700, 0), new Victor(200, 0),
            new Victor(200, 900), new Victor(700, 900),
            new Victor(700, 900), new Victor(900, 700),
            new Victor(900, 700), new Victor(900, 200),
            new Victor(200, 0), new Victor(0, 200),
            new Victor(200, 450), new Victor(375, 375),
            new Victor(375, 375), new Victor(450, 200),
            new Victor(450, 200), new Victor(525, 375),
            new Victor(525, 375), new Victor(700, 450),
            new Victor(700, 450), new Victor(525, 525),
            new Victor(525, 525), new Victor(450, 700),
            new Victor(450, 700), new Victor(375, 525),
            new Victor(375, 525), new Victor(200, 450)
        ];
        this.powerups = [
            new Powerup('health', new Victor(450, 800)),
            new Powerup('health', new Victor(450, 100)),
            new Powerup('ammo', new Victor(100, 450)),
            new Powerup('ammo', new Victor(800, 450))
        ];
        this.projectiles = [];
    }
}

// The "Player" class stores the state of each player
// Such as the weapon & armor of choice, moving / firing state,
// and discrete game information such as kills and deaths
class Player {
    constructor(name, color, armor, weapon, pos) {
        this.name = name;
        this.color = color;
        this.weapon = weapon;
        this.isMoving = false;
        this.isMovingUp = false;
        this.isMovingDown = false;
        this.armor = armor;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isFiring = false;
        this.pos = pos;
        this.dir = 0;
        this.target = pos;
        this.isAlive = true;
        this.killCount = 0;
        this.deathCount = 0;
        this.respawnTime = 1750;
        this.cd = this.respawnTime;
    }

    setAction(action, flag) {
        switch (action) {
            case 'W':
                this.isMovingUp = flag;
                this.isMoving = this.isMovingUp || this.isMovingDown || this.isMovingLeft || this.isMovingRight;
                break;
            case 'S':
                this.isMovingDown = flag;
                this.isMoving = this.isMovingUp || this.isMovingDown || this.isMovingLeft || this.isMovingRight;
                break;
            case 'A':
                this.isMovingLeft = flag;
                this.isMoving = this.isMovingUp || this.isMovingDown || this.isMovingLeft || this.isMovingRight;
                break;
            case 'D':
                this.isMovingRight = flag;
                this.isMoving = this.isMovingUp || this.isMovingDown || this.isMovingLeft || this.isMovingRight;
                break;
            case 'R':
                this.weapon.reload();
                break;
            case '0':
                this.isFiring = flag;
                break;
            default:
                break;
        }
    }

    move() {
        collisionPos = null;
        var x = 0;
        var y = 0;
        if (this.isMovingUp) y -= this.armor.speed * MULTIPLIER;
        if (this.isMovingDown) y += this.armor.speed * MULTIPLIER;
        if (this.isMovingLeft) x -= this.armor.speed * MULTIPLIER;
        if (this.isMovingRight) x += this.armor.speed * MULTIPLIER;

        var velocity = new Victor(x, y);
        var epslion = new Victor(x / 10, y / 10);

        // Handle powerup collision
        var list = game.map.powerups;
        for (var i = 0; i < list.length; ++i) {
            solveCircleCircleIntersection(this.pos, this.armor.radius, list[i].pos, list[i].radius, velocity);
            if (collisionPos != null) {
                list[i].boost(this);
            }
        }

        // Handle plane collision
        list = game.map.planes;
        for (var i = 0; i < list.length; i += 2) {
            solveCircleLineIntersection(this.pos.clone().add(velocity), this.armor.radius, list[i], list[i + 1], velocity);

            if (collisionPos != null) {
                this.pos = collisionPos;
                this.pos = this.pos.subtract(velocity);
                break;
            }
        }

        this.pos = this.pos.add(velocity);
        if (collisionPos != null) return;

        // Handle player collision
        var list = game.players;
        for (var i = 0; i < list.length; ++i) {
            if (i == this.color) continue;
            solveCircleCircleIntersection(this.pos.clone().add(epslion), this.armor.radius, list[i].pos, list[i].armor.radius, velocity);

            if (collisionPos != null) {
                this.pos = collisionPos;
                this.pos = this.pos.subtract(epslion);
                break;
            }
        }
    }

    hurt(attacker, damage) {
        if (!this.isAlive) return;

        this.armor.health -= damage;
        game.playSound('hit', this.pos.x, this.pos.y);
        if (this.armor.health <= 0) {
            game.playSound('oof', this.pos.x, this.pos.y);
            this.armor.health = 0;
            this.isAlive = false;
            this.pos.x = -BIG;
            this.pos.y = -BIG;
            ++attacker.killCount;
            ++this.deathCount;
        }
    }

    respawn() {
        if (!this.isAlive) {
            this.cd -= TICK_INTERVAL;
            if (this.cd <= 0) {
                this.isAlive = true;
                this.cd = this.respawnTime
                this.armor.health = this.armor.maxHealth;
                this.weapon.clip = this.weapon.maxClip;
                this.weapon.spareAmmo = this.weapon.maxSpareAmmo;
                initPlayerPosition(parseInt(this.color));
            }
        }
    }
}

// The "Armor" class stores the state of an armor
class Armor {
    constructor(name, health, speed, radius, owner) {
        this.name = name;
        this.maxHealth = health;
        this.health = this.maxHealth;
        this.speed = speed;
        this.radius = radius;
    }
}

// The "Weapon" class stores the state of a weapon
// Note that it is "state" not "attributes" because discrete game information
// like the number of spare ammo is also stored in this class
class Weapon {
    constructor(name, damage, rate, radius, speed, numRicochet, bonus, clip, spareAmmo, reloadTime, owner) {
        this.name = name;
        this.damage = damage;
        this.rate = 1000 / rate;
        this.fireCd = this.rate;
        this.radius = radius;
        this.speed = speed;
        this.numRicochet = numRicochet;
        this.bonus = bonus;
        this.maxClip = clip;
        this.clip = this.maxClip;
        this.maxSpareAmmo = spareAmmo;
        this.spareAmmo = this.maxSpareAmmo;
        this.isReady = true
        this.isReloading = false;
        this.reloadTime = reloadTime;
        this.reloadCd = this.reloadTime;
        this.owner = owner;
    }

    cooldown() {
        if (!this.isReady) {
            this.fireCd -= TICK_INTERVAL;
            if (this.fireCd <= 0) {
                this.isReady = true;
                this.fireCd = this.rate;
            }
        }

        if (this.isReloading) {
            this.reloadCd -= TICK_INTERVAL;
            if (this.reloadCd <= 0) {
                var required = this.maxClip - this.clip;
                this.spareAmmo -= required;
                var available = required;
                if (this.spareAmmo < 0) {
                    available += this.spareAmmo;
                    this.spareAmmo = 0;
                }
                this.clip += available;
                this.isReloading = false;
                this.reloadCd = this.reloadTime;
            }
        }
    }

    reload() {
        if (this.clip >= this.maxClip) return;
        if (this.spareAmmo <= 0) return;
        if (this.isReloading) return;
        game.playSound('reload', game.players[this.owner].pos.x, game.players[this.owner].pos.y);
        this.isReloading = true;
    }

    fire(player, playerPos, playerRadius, angle) {
        if (!this.isReady) return;
        if (this.isReloading) return;
        if (this.clip <= 0) return;
        --this.clip;
        this.isReady = false;
        game.playSound('pew', playerPos.x, playerPos.y);

        var distance = playerRadius + this.radius;
        var x = distance * Math.cos(angle);
        var y = distance * Math.sin(angle);
        var pos = new Victor(x + playerPos.x, y + playerPos.y);
        var velocity = new Victor(this.speed * Math.cos(angle), this.speed * Math.sin(angle));
        game.map.projectiles.push(new Projectile(pos, velocity, player, this.damage, this.radius, this.numRicochet, this.bonus));
    }
}

// The "Projectile" class defines a projectile
// Such as its location, velocity, bonus damage gained from the number of
// ricochet it has experienced
class Projectile {
    constructor(pos, velocity, player, damage, radius, numRicochet, bonus) {
        this.id = projectileId;
        ++projectileId;
        this.pos = pos;
        this.velocity = velocity;
        this.player = player;
        this.damage = damage;
        this.radius = radius;
        this.numRicochet = numRicochet;
        this.bonus = bonus;
        this.isAlive = true;
    }

    move() {
        var velocity = new Victor(this.velocity.x * MULTIPLIER, this.velocity.y * MULTIPLIER);
        var epslion = new Victor(this.velocity.x * MULTIPLIER / 10, this.velocity.y * MULTIPLIER / 10);

        // Handles collision with players
        var list = game.players;
        for (var i = 0; i < list.length; ++i) {
            if (list[i].color == this.player) continue;
            solveCircleCircleIntersection(this.pos.clone().add(epslion), this.radius, list[i].pos, list[i].armor.radius, velocity);

            // Projectile hits enemy player
            if (collisionPos != null) {
                list[i].hurt(list[this.player], this.damage);
                this.isAlive = false;
                return;
            }
        }

        // Handles collision with planes
        list = game.map.planes;
        for (var i = 0; i < list.length; i += 2) {
            solveCircleLineIntersection(this.pos.clone().add(epslion), this.radius, list[i], list[i + 1], velocity);
            if (collisionPos != null) {
                this.pos = collisionPos;
                game.playSound('ding', this.pos.x, this.pos.y);

                // Define a tangent line y = mx + c, where (x, y) are the velocity and m is the slope of a line perpendicular to collision normal
                if (((velocity.x < 0) && (velocity.y < 0) || (velocity.x > 0) && (velocity.y > 0)) && (collisionNormal == BIG)) {
                    collisionNormal = -collisionNormal;
                }
                var tangent_m = -1 / collisionNormal;
                var tangent_c = -tangent_m * this.velocity.x + this.velocity.y;

                var xm = -tangent_c / (tangent_m - collisionNormal);
                var ym = collisionNormal * xm;
                var x2 = 2 * xm - this.velocity.x;
                var y2 = 2 * ym - this.velocity.y;

                this.pos = this.pos.subtract(velocity);

                this.velocity.x = -x2;
                this.velocity.y = -y2;

                --this.numRicochet;
                this.damage *= (1 + this.bonus);
                this.radius *= (1 + this.bonus * 0.1);
                if (this.numRicochet <= 0) {
                    this.isAlive = false;
                }
            }
        }
        this.pos = this.pos.add(velocity);
    }
}

// The "Powerup" class defines the state of a powerup
// Currently there are "health" and "ammo", which recovers 50% of the player's
// max health and spare ammo respectively
class Powerup {
    constructor(type, pos) {
        this.type = type;
        this.pos = pos;
        this.radius = 16;
        this.respawnTime = 3000;
        this.cd = this.respawnTime;
        this.isAlive = true;
    }

    cooldown() {
        if (!this.isAlive) {
            this.cd -= TICK_INTERVAL;
            if (this.cd <= 0) {
                this.isAlive = true;
                this.cd = this.respawnTime;
            }
        }
    }

    boost(player) {
        if (!this.isAlive) return;


        if (this.type == 'health') {
            if (player.armor.health >= player.armor.maxHealth) return;
            player.armor.health += player.armor.maxHealth / 2;
            game.playSound('recover', this.pos.x, this.pos.y);
            if (player.armor.health > player.armor.maxHealth) {
                player.armor.health = player.armor.maxHealth;
            }
        }

        if (this.type == 'ammo') {
            if (player.weapon.spareAmmo >= player.weapon.maxSpareAmmo) return;
            player.weapon.spareAmmo += player.weapon.maxSpareAmmo / 2;
            game.playSound('recover', this.pos.x, this.pos.y);
            if (player.weapon.spareAmmo > player.weapon.maxSpareAmmo) {
                player.weapon.spareAmmo = player.weapon.maxSpareAmmo;
            }
        }

        this.isAlive = false;
    }
}

game = new Game();

// Handles user input
parentPort.on('message', data => {
    var parsed = data.split(' ');   // parsed[0] is "action"; parsed[1] is "player"; parsed[2] is "data"

    // On connection - Spawns players
    if (parsed[0] == 'connection') {
        var curPlayer = parsed[1] % 4;

        game.players.push(new Player(
            "Player" + parsed[1],
            parsed[1],
            new Armor("Generic Armor", 100, PLAYER_MOVE_SPEED, 16, curPlayer),
            new Weapon("Generic Gun", PROJECTILE_DAMAGE, PLAYER_FIRE_RATE, 3, PROJECTILE_MOVE_SPEED, 4, 1.5, PLAYER_CLIP, PLAYER_SPARE_AMMO, 1500, curPlayer),
            new Victor(0, 0)
        ));

        initPlayerPosition(curPlayer);
    };

    // Start the game on-demand
    if (parsed[0] == 'startGame') {
        var mode = parsed[1];
        if (mode == 'slowmo-mode') {
            PROJECTILE_MOVESPEED = 400;
            PROJECTILE_DAMAGE = 8;
            PLAYER_FIRE_RATE = 8;
            for (var i = 0; i < game.players.length; ++i) {
                game.players[i].weapon.speed = PROJECTILE_MOVESPEED;
                game.players[i].weapon.damage = PROJECTILE_DAMAGE;
                game.players[i].weapon.rate = 1000 / PLAYER_FIRE_RATE;
                game.players[i].weapon.firecd = game.players[i].weapon.rate;
            }
        }
        if (mode == 'bullethell-mode') {
            PROJECTILE_DAMAGE = 2;
            PLAYER_FIRE_RATE = 20;
            PLAYER_CLIP = 125;
            PLAYER_SPARE_AMMO = 400;
            for (var i = 0; i < game.players.length; ++i) {
                game.players[i].weapon.damage = PROJECTILE_DAMAGE;
                game.players[i].weapon.rate = 1000 / PLAYER_FIRE_RATE;
                game.players[i].weapon.firecd = game.players[i].weapon.rate;
                game.players[i].weapon.clip = PLAYER_CLIP;
                game.players[i].weapon.maxClip = game.players[i].weapon.clip
                game.players[i].weapon.spareAmmo = PLAYER_SPARE_AMMO;
                game.players[i].weapon.maxSpareAmmo = game.players[i].weapon.spareAmmo
            }
        }
        run();
    }

    if (parsed[0] == 'startAction') {
        game.players[parsed[1]].setAction(parsed[2], true);
    }

    if (parsed[0] == 'updateDirection') {
        game.players[parsed[1]].dir = parsed[2];
    }

    if (parsed[0] == 'endAction') {
        game.players[parsed[1]].setAction(parsed[2], false);
    }

});

// The "game" function that runs physical simulations and game logics indefinitely
// until a winner emerges
async function run() {
    // Handle player events
    var list = game.players;
    if (list != null) for (var i = 0; i < list.length; ++i) {
        // Terminate simulation when winning condition is achieved
        if (list[i].killCount >= WIN_KILL_COUNT) {
            parentPort.postMessage('end ' + i);
            return;
        }

        // Attempt to respawn dead player
        if (!list[i].isAlive) {
            list[i].respawn();
            continue;
        }

        // Move player to new position according to their movement state
        list[i].move();

        // Handle weapon-related events
        if (list[i].weapon.clip <= 0) list[i].weapon.reload();  // Auto-reload if clip is empty
        list[i].weapon.cooldown();  // Attempt to cooldown the gun if it is being fired continuously
        if (list[i].isFiring) { // Fire the gun if the current player state is "firing"
            list[i].weapon.fire(list[i].color, list[i].pos, list[i].armor.radius, list[i].dir);
        }
    }

    // Handle projectile events
    list = game.map.projectiles;
    if (list != null) for (var i = 0; i < list.length; ++i) {
        // Delete projectiles that have despawned
        // i.e. Projectiles that hit an enemy player / reached max number of ricochets
        if (list[i] != null) if (list[i].isAlive == false) {
            list[i] = null;

            // Move projectiles that are still "alive"
        } else {
            list[i].move();
        }
    }

    // Remove dead projectiles from the list
    var filtered = list.filter(function (e) {
        return e != null;
    });
    game.map.projectiles = filtered;

    // Handle powerup events
    list = game.map.powerups;
    if (list != null) for (var i = 0; i < list.length; ++i) {
        // Attempt to respawn consumed powerups
        list[i].cooldown();
    }

    // Broadcast the latest game state to all cilents, then run the next iteration of
    // the game simulation
    game.render();
    setTimeout(() => {
        run();
    }, TICK_INTERVAL);
}