import {DjsClientSocket, DjsConnect} from "@unitn-asa/deliveroo-js-sdk"
import "dotenv/config"

/**
 * TODO:
 * Implement check for agent near (avoidance system) -> can be useful to observe what other agent do and check if they are moving in other direction. Note that if an agent exit your sensing area, you'll receive an empty array
 * Crate is a block that can be moved but can block you -> implement avoidance/solution
 * Implement check for disappeared parcel agent was carrying (they are automatically removed if point goes to zero, so the agent could believe to have a package but actually don't have any)
 * Improve delivery strategy
 * Implement check for cornered part of the map and reasoning of other agent position
 * PROJECT: reasoning about other agent position is NECESSARY. more complex the belief revision is the better.
*/

/**
 * 
 * @param {number} max 
 * @returns 
 */
function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

/**
 * @typedef IOTileType
 * Tile type representation (string)
 * 0=none
 * 1=ok, parcel spawning
 * 2=delivery
 * 3=walkable
 * @type { '0' | '1' | '2' | '3' | '4' | '5' | '5!' | '←' | '↑' | '→' | '↓' }
*/

class coordinates {
    /**
     * Constructor of coordinates
     * @param {number}  x
     * @param {number}  y
     */
    constructor(x,y) {
        this.x = x;
        this.y = y;
    }

    toString() {
        return `${this.x},${this.y}`;
    }
}

class beliefs {
    /**
     * Constructor of beliefs
     * @param {coordinates}  currentPosition
     */
    constructor(currentPosition) {
        /**
         * Current position of the agent
         * @type {coordinates}
         */
        this.currentPosition = currentPosition;
        /**
         * Register how many parcels is the agent currently carrying
         * @type {number}
         */
        this.collectedParcels=0
        /**
         * Register whether the agent is carrying a parcel or not
         * @type {boolean}
         */
        this.carryParcel=false;
        /**
         * Register the previous
         * @type {String}
         */
        this.previousMove="";
        /**
         * Counter used to change current movement plan. If higher than a certain value it will try a random move
         * @type {number}
         */
        this.failCounter=0;
        /**
         * Internal map of spawn tiles specifically
         * @type {Map<String,IOTileType>}
         */
        this.spawnTiles= new Map();
        /**
         * Internal map of delivering tiles specifically
         * @type {Map<String,IOTileType>}
         */
        this.deliverTiles=new Map();
        /**
         * Internal map received upon connection with the server
         * @type {Map<String,IOTileType>}
         */
        this.internalMap=new Map();
        /**
         * Map of sensed parcels that were set as carried
         * @type {Map<String,coordinates>}
         */
        this.sensedParcels=new Map();
    }
}

class agent {
    /**
        * Internal connection socket of the agent
        * @type {DjsClientSocket}
    */
    #connectionSocket

    /**
     * Internal beliefs of the agent
     * @type {beliefs}
     */
    #internalBeliefs

    /**
     * Constructor of agent Perry
     * @param {DjsClientSocket} connectionSocket
     * @param {beliefs} internalBeliefs
     */
    constructor(connectionSocket,internalBeliefs) {
        this.#connectionSocket=connectionSocket
        this.#internalBeliefs=internalBeliefs
    }

    /**
     * Updater for the local position
     * @param {import("@unitn-asa/deliveroo-js-sdk").IOAgent} agentInfo 
     */
    #updatePosition(agentInfo) {
        if(agentInfo.x && agentInfo.y) {
            this.#internalBeliefs.currentPosition.x=agentInfo.x;
            this.#internalBeliefs.currentPosition.y=agentInfo.y;
        }
    }

    /**
     * Updater for the (global) internal map
     * @param {import("@unitn-asa/deliveroo-js-sdk").IOTile} tile 
     */
    #updateInternalMap(tile) {
        let tileCoordinates = new coordinates(tile.x,tile.y)
        this.#internalBeliefs.internalMap.set(tileCoordinates.toString(),tile.type)
        if(tile.type=="2") {
            this.#internalBeliefs.deliverTiles.set(tileCoordinates.toString(),"2")
        } else if (tile.type=="1") {
            this.#internalBeliefs.spawnTiles.set(tileCoordinates.toString(),"1")
        }
    }

    /**
     * Updater for the map of sensed parcels
     * @param {import("@unitn-asa/deliveroo-js-sdk").IOParcel} parcel 
     */
    #updateSensedParcels(parcel) {
        let currentParcelCoordinates = new coordinates(parcel.x,parcel.y);
        if(parcel.carriedBy==null) {
            this.#internalBeliefs.sensedParcels.set(parcel.id,currentParcelCoordinates);
        } else if (parcel.carriedBy!="anonymous"){
            this.#internalBeliefs.sensedParcels.delete(parcel.id)
        }
    }

    setupUpdateHandlers() {
        let promiseArray = [];
        promiseArray.push(new Promise((resolve)=>{
            this.#connectionSocket.onYou((agentInfo)=>{
                this.#updatePosition(agentInfo)
                resolve(true)
            })
        }))
        promiseArray.push(new Promise((resolve)=>{
            this.#connectionSocket.onSensing((sensing)=>{
                let currentParcel;
                let currentPosition = this.#internalBeliefs.currentPosition.toString()

                //Update list of sensed parcels
                for(let i=0;i<sensing.parcels.length;i+=1) {
                    currentParcel=sensing.parcels[i];
                    this.#updateSensedParcels(currentParcel)
                }

                //If second movement happen, so agent is on next tile, check for the possibility of picking up or put down parcels
                if(currentPosition.includes(".")!=undefined) {
                    if(this.#internalBeliefs.carryParcel && this.#internalBeliefs.deliverTiles.get(currentPosition)!=undefined) {
                        this.#dropAllParcels()
                    } else if(this.#internalBeliefs.spawnTiles.get(currentPosition)!=undefined) {
                        this.#pickupParcel()
                    }
                }

                resolve(true)
            })
        }))
        promiseArray.push(new Promise((resolve)=>{
            this.#connectionSocket.onTile((tile)=>{
                //Get all Tiles of the map
                this.#updateInternalMap(tile);
                resolve(true)
            })
        }))
        return promiseArray;
    }
    /**
     * Find a possible move given the position in the parameters
     * @param {number} currentX 
     * @param {number} currentY 
     */
    #findMoveGivenPos(currentX,currentY) {
        //find move, right of way: up, right, left, down
        let up = new coordinates(currentX,currentY+1).toString();
        let right = new coordinates(currentX+1,currentY).toString();
        let left = new coordinates(currentX-1,currentY).toString();
        let down = new coordinates(currentX,currentY-1).toString();

        switch(true) {
            case this.#internalBeliefs.previousMove!="down"&&this.#internalBeliefs.internalMap.has(up)&&this.#internalBeliefs.internalMap.get(up)!="0":
                return "up";
            case this.#internalBeliefs.previousMove!="left"&&this.#internalBeliefs.internalMap.has(right)&&this.#internalBeliefs.internalMap.get(right)!="0":
                return "right";
            case this.#internalBeliefs.previousMove!="right"&&this.#internalBeliefs.internalMap.has(left)&&this.#internalBeliefs.internalMap.get(left)!="0":
                return "left";
            case this.#internalBeliefs.previousMove!="up"&&this.#internalBeliefs.internalMap.has(down)&&this.#internalBeliefs.internalMap.get(down)!="0":
                return "down";
            default:
                return false;  
        }
    }

    /**
     * Generate a random movement
     */
    async randomMove() {
        let result
        let moves=["up","down","right","left"]
        let move=moves[getRandomInt(4)]
        do {
            if((move=="up"||move=="right"||move=="left"||move=="down")) {
                result = await this.#connectionSocket.emitMove(move)
            }
            console.log("tried ",move)
            move=moves[getRandomInt(4)]
        } while(result==false)
    }

    #pickupParcel() {
        this.#internalBeliefs.sensedParcels.forEach(async (parcelCoordinates,_)=>{
            if(parcelCoordinates.toString()==this.#internalBeliefs.currentPosition.toString()) {
                let result = await this.#connectionSocket.emitPickup()
                if(result) {
                    this.#internalBeliefs.carryParcel=true;
                } else {
                    console.log("Something went wrong during pickup")
                }
            }
        })
    }

    async #dropAllParcels() {
        let result = await this.#connectionSocket.emitPutdown()
        if(result) {
            console.log("Dropped ", result);
            this.#internalBeliefs.carryParcel=false;
        } else {
            console.log("Something went wrong during dropping")
        }
    }

    //getNew

    async movePseudoRandomly() {
        //Try to go in any direction
        let currentX = this.#internalBeliefs.currentPosition.x;
        let currentY = this.#internalBeliefs.currentPosition.y;
        let result
        let move = this.#findMoveGivenPos(currentX,currentY);
        console.log(`current ${currentX} ${currentY}`)
        if(move!=false&&(move=="up"||move=="right"||move=="left"||move=="down")) {
            console.log("trying "+move)
            result = await this.#connectionSocket.emitMove(move)
            if(result==false) {
                console.log("Move failed ", move)
                this.#internalBeliefs.failCounter+=1
                if(this.#internalBeliefs.failCounter==4) {
                    this.#internalBeliefs.failCounter=0;
                    await this.randomMove()
                }
            } else {
                this.#internalBeliefs.previousMove=move
                console.log("success ", move)
            }
        } else {
            //If tile was not in map try a random move (order: up,right,left,down)
            await this.randomMove()
        }

    }

}

function main() {
    const connectionSocket = DjsConnect()

    connectionSocket.onConnect(async ()=>{
        console.log("connected");
        let currentPosition = new coordinates(0,0)

        /**
         * @type {beliefs}
         */
        let currentBeliefs = new beliefs(currentPosition);

        const perry = new agent(connectionSocket,currentBeliefs);

        //Await the first update to complete
        let promiseArray = perry.setupUpdateHandlers()
        Promise.all(promiseArray).then(async ()=>{
            for(let a=0;a<20;a+=1) {
                await perry.movePseudoRandomly()
                await new Promise(r => setTimeout(r, 100));
            }
            //connectionSocket.disconnect()
        })

    })
    

}

//Entry point of the script
main()