from app.schemas.split_bill_schema import SplitBillDraft


def allocate(cents: int, weights: list[int]) -> list[int]:
    """Largest remainder allocation: deterministic, exact to the last cent."""
    total = sum(weights)
    if not total:
        return [0] * len(weights)
    values = [cents * weight // total for weight in weights]
    order = sorted(range(len(weights)), key=lambda index: (-(cents * weights[index] % total), index))
    for index in order[:cents - sum(values)]:
        values[index] += 1
    return values


def calculate_bill(draft: SplitBillDraft) -> dict:
    ids = [person.id for person in draft.people]
    subtotals = [0] * len(ids)
    subtotal = 0
    unassigned = 0
    for item in draft.items:
        amount = int(item.price * 100) * item.quantity
        subtotal += amount
        if not item.people:
            unassigned += amount
        else:
            shares = allocate(amount, [int(person_id in item.people) for person_id in ids])
            subtotals = [left + right for left, right in zip(subtotals, shares)]
    tax, tip = int(draft.tax * 100), int(draft.tip * 100)
    total = subtotal + tax + tip
    taxes, tips = allocate(tax, subtotals), allocate(tip, subtotals)
    people = [dict(id=person.id, name=person.name, subtotal=subtotals[i], tax=taxes[i], tip=tips[i],
                   total=subtotals[i] + taxes[i] + tips[i]) for i, person in enumerate(draft.people)]
    matches = draft.receipt_total is not None and int(draft.receipt_total * 100) == total
    return dict(subtotal=subtotal, tax=tax, tip=tip, total=total, people=people,
                unassigned=unassigned, all_assigned=all(item.people for item in draft.items),
                matches=matches, allocated=sum(person["total"] for person in people),
                bank_debit=subtotal + tax + (tip if draft.tip_method == "bank" else 0))
