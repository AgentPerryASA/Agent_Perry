;; domain file: domain.pddl
;; Since precondition cannot be negative, during generation of the problem reference to non reachable tiles must be avoided
;; Every tile in the problem must be described wrt their neighbors (ex. t1 is under t2 over t3 right of t4 and left of t5)

(define (domain default)
    (:requirements :strips)
    (:predicates
        (over ?t1 ?t2) ;;tile t1 is OVER tile t2
        (under ?t1 ?t2) ;;tile t1 is UNDER tile t2
        (right ?t1 ?t2) ;;tile t1 is at the RIGHT of tile t2
        (left ?t1 ?t2)  ;;tile t1 is at the LEFT of tile t2
        (crateTile ?t) ;;tile is a YELLOW tile
        (perry ?t) ;;tile has PERRY over it
        (crate ?t) ;;tile has a CRATE over it
        (notCrate ?t) ;;tile has NOT a CRATE over it (not precondition cannot be expressed, therefore this state is necessary)
    )

    ;;not(and not(a) not(b))  = a or b De Morgan, not(a or b) = not a and not b; therefore a or b = not(not a and not b)

    (:action MoveUp
        :parameters (?t1 ?t2) ;;move up from t1 to t2
        :precondition (and (perry ?t1) (under ?t1 ?t2) (notCrate ?t2))
        :effect (and (not(perry ?t1)) (perry ?t2))
    )

    (:action MoveDown
        :parameters (?t1 ?t2) ;;move down from t1 to t2
        :precondition (and (perry ?t1) (over ?t1 ?t2) (notCrate ?t2))
        :effect (and (not(perry ?t1)) (perry ?t2))
    )

    (:action MoveLeft
        :parameters (?t1 ?t2) ;;move left from t1 to t2
        :precondition (and (perry ?t1) (right ?t1 ?t2) (notCrate ?t2))
        :effect (and (not(perry ?t1)) (perry ?t2))
    )

    (:action MoveRight
        :parameters (?t1 ?t2) ;;move right from t1 to t2
        :precondition (and (perry ?t1) (left ?t1 ?t2) (notCrate ?t2))
        :effect (and (not(perry ?t1)) (perry ?t2))
    )

    (:action MoveCrateUp
        :parameters (?t1 ?t2 ?t3) ;;move up from t1 to t2 by putting crate present on t2 to t3
        :precondition (and (perry ?t1) (under ?t1 ?t2) (under ?t2 ?t3) (crate ?t2) (notCrate ?t3) (crateTile ?t3))
        :effect (and (not(perry ?t1)) (perry ?t2) (notCrate ?t2) (crate ?t3))
    )

    (:action MoveCrateDown
        :parameters (?t1 ?t2 ?t3) ;;move down from t1 to t2 by putting crate present on t2 to t3
        :precondition (and (perry ?t1) (over ?t1 ?t2) (over ?t2 ?t3) (crate ?t2) (notCrate ?t3) (crateTile ?t3))
        :effect (and (not(perry ?t1)) (perry ?t2) (notCrate ?t2) (crate ?t3))
    )

    (:action MoveCrateLeft
        :parameters (?t1 ?t2 ?t3) ;;move left from t1 to t2 by putting crate present on t2 to t3
        :precondition (and (perry ?t1) (right ?t1 ?t2) (right ?t2 ?t3) (crate ?t2) (notCrate ?t3) (crateTile ?t3))
        :effect (and (not(perry ?t1)) (perry ?t2) (notCrate ?t2) (crate ?t3))
    )

    (:action MoveCrateRight
        :parameters (?t1 ?t2 ?t3) ;;move right from t1 to t2 by putting crate present on t2 to t3
        :precondition (and (perry ?t1) (left ?t1 ?t2) (left ?t2 ?t3) (crate ?t2) (notCrate ?t3) (crateTile ?t3))
        :effect (and (not(perry ?t1)) (perry ?t2) (notCrate ?t2) (crate ?t3))
    )
)