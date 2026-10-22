"""Terminal cohort accounting independent of arrivals and invariant-only verification."""


def cohort_complete(seed_ids, admitted_ids, waiting_ids, paid, reservation_sold_out, sold_out_waiters):
    return (len(seed_ids) == len(set(seed_ids)) == 5000
            and admitted_ids == seed_ids[:len(admitted_ids)]
            and waiting_ids == seed_ids[len(admitted_ids):]
            and paid > 0
            and paid + reservation_sold_out == len(admitted_ids)
            and sold_out_waiters == len(waiting_ids))
