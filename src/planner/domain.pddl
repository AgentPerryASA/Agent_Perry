;; domain file: domain.pddl
;; all tiles must be defined with reference to a deliver or a pickup tile
;; Since precondition cannot be negative, during generation of the problem reference to non reachable tiles must be avoided

(define (domain pr)
    (:requirements :strips)
    (:predicates
        (over ?t1 ?t2) ;;tile t1 is OVER tile t2
        (under ?t1 ?t2) ;;tile t1 is UNDER tile t2
        (right ?t1 ?t2) ;;tile t1 is at the RIGHT of tile t2
        (left ?t1 ?t2)  ;;tile t1 is at the LEFT of tile t2
        (crateTile ?t) ;;tile is a YELLOW tile
        (perry ?t) ;;tile has PERRY over it
        (crate ?t) ;;tile has a CRATE over it
        (arrivalTile ?t) ;;tile is where PERRY should arrive
    )

    ;;not(and not(a) not(b))  = a or b De Morgan, not(a or b) = not a and not b; therefore a or b = not(not a and not b)

    (:action MoveUp
        :parameters (?t1 ?t2) ;;move from t1 to t2
        :precondition (and (perry ?t1) (under ?t1 ?t2))
        :effect (and (not(perry ?t1)) (perry ?t2))
    )
)