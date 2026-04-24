/*** @typedef IOParcel @type {import("@unitn-asa/deliveroo-js-sdk").IOParcel}} */

class Parcel {

    /**@type {number} */
    lastUpdateTimestamp

    /**@type {IOParcel} */
    parcel

    /**
     * 
     * @param {IOParcel} parcel 
     * @param {number} lastUpdateTimestamp
     */
    constructor(parcel, lastUpdateTimestamp) {
        this.parcel = parcel
        this.lastUpdateTimestamp = lastUpdateTimestamp
    }

}

export class Beliefs {
    /**@type {Parcel[]} */
    #parcelList

    constructor() {
        this.#parcelList = []
    }

    /**
     * 
     * @param {Parcel} parcel 
     * @param {number} endTime
     * @returns {boolean}
     */
    #isParcelToBeRemoved(parcel,endTime) {
        let newReward = parcel.parcel.reward-Math.floor((endTime-parcel.lastUpdateTimestamp)/1000)
        //console.log(" -> new reward ", newReward, "With less ", Math.floor((endTime-parcel.lastUpdateTimestamp)/1000))
            if(newReward<=0) {
                return true
            } else {
                return false
            }
    }


    /**
     * @param {IOParcel[] | undefined} sensedParcelList 
     */
    reviseParcelList(sensedParcelList) {

        let endTime = Date.now()+0.02*this.#parcelList.length //Assume the function takes about 3 seconds to run

        /**@type {Map<string,IOParcel>} */
        let sensedParcelMap = new Map()
        if (sensedParcelList != undefined) {
            sensedParcelMap = new Map(
                sensedParcelList.map(parcel => [parcel.id,parcel])
            )
        }

        for(let i=0;i<this.#parcelList.length;i+=1) {

            //console.log("CHECK in list ",this.#parcelList[i].parcel.id, "of", this.#parcelList.length)
            let currentParcelFromBelief = this.#parcelList[i]
            let currentParcelFromSensedList = sensedParcelMap.get(currentParcelFromBelief.parcel.id)

            if(currentParcelFromSensedList!=undefined) {
                //If the current parcel was in the sensed list, then update value with that. A check to see if it is now carried is necessary.
                if(currentParcelFromSensedList.carriedBy == undefined ) {
                    //console.log("Old parcel",currentParcelFromSensedList.id, "sensed again and not carried. UPDATING.")
                    this.#parcelList[i].parcel = currentParcelFromSensedList
                    this.#parcelList[i].lastUpdateTimestamp=endTime
                } else {
                    //If parcel is carried, remove it from the list
                    //console.log("Old parcel",currentParcelFromSensedList.id, "sensed again and carried. DELETING.")
                    this.#parcelList.splice(i)
                    i-=1
                }

                //Remove the just analyzed parcel from the map so later it is possible to see what are the new parcels
                sensedParcelMap.delete(currentParcelFromBelief.parcel.id)

            } else {
                //console.log("Old parcel",currentParcelFromBelief.parcel.id, "can no longer be sensed. CHECK.")
                if(this.#isParcelToBeRemoved(currentParcelFromBelief,endTime)) {
                    //If parcel is not present in the current sensed list, it can no longer be sensed: check if it is necessary to delete it
                    //console.log(" -> no sensed parcel too old. DELETING.")
                    this.#parcelList.splice(i)
                    i-=1
                } else {
                    this.#parcelList[i].parcel.reward-=Math.floor((endTime-currentParcelFromBelief.lastUpdateTimestamp)/1000)
                    this.#parcelList[i].lastUpdateTimestamp=endTime
                }
            }    
        }

        for (const [_, parcel] of sensedParcelMap) {

            if(parcel.carriedBy == undefined) {
                let newParcel = new Parcel(parcel,Date.now())

                this.#parcelList.push(newParcel)
                //console.log("Push new parcel ", parcel.id, " with reward ", parcel.reward)
            }

        }

    }

    get parcelList() {
        return this.#parcelList
    }
}