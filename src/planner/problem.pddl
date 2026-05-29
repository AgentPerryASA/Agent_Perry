;; problem file: problem-lights.pddl
(define (problem pr)
    (:domain pr)
    (:objects t1 t2 t3 t4 t5)
    (:init (perry t4) (left t1 t2) (left t2 t3) (right t2 t1) (left t3 t4) (right t3 t2) (under t3 t5) (right t4 t3) (over t5 t3) (crate t3) (notCrate t1) (notCrate t2) (notCrate t4) (notCrate t5) (crateTile t3) (crateTile t2))
    (:goal (and (perry t5)))
)