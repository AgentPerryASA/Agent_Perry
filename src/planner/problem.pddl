;; problem file: problem-lights.pddl
(define (problem pr)
    (:domain pr)
    (:objects p t1 t2)
    (:init (perry t1) (under t1 t2) (pathTile t1) (pathTile t2))
    (:goal (and (perry t2)))
)