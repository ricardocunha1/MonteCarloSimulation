from types import SimpleNamespace

import pytest

from app.services.validation import has_sprint_history_items, validate_parameters

FILE_REQUIRED = "A Sprint History Excel file is required."


def _form(**overrides):
    form = {
        "target_type": "Items Resolved",
        "target_value": "5",
        "num_simulations": "1000",
        "sprint_start_date": "2026-07-11",
        "sprint_length": "10",
    }
    form.update(overrides)
    return form


@pytest.mark.parametrize(
    "form, expected",
    [
        ({}, False),
        ({"sprint_history_items": ""}, False),
        ({"sprint_history_items": "  \n "}, False),
        ({"sprint_history_items": "[]"}, True),
        ({"sprint_history_items": "not json"}, True),  # content is checked by data_processing
    ],
)
def test_has_sprint_history_items(form, expected):
    assert has_sprint_history_items(form) is expected


def test_file_not_required_with_sprint_history_items():
    assert validate_parameters(_form(sprint_history_items="[{}]"), None) == []


@pytest.mark.parametrize("items", [None, "", "   "])
def test_file_still_required_without_sprint_history_items(items):
    form = _form() if items is None else _form(sprint_history_items=items)
    assert validate_parameters(form, None) == [FILE_REQUIRED]
    assert validate_parameters(form, SimpleNamespace(filename="")) == [FILE_REQUIRED]


def test_items_do_not_hide_parameter_errors():
    errors = validate_parameters(_form(sprint_history_items="[{}]", target_value="0"), None)
    assert errors == ["Target Value must be a positive number."]


def test_file_with_items_present_is_accepted():
    form = _form(sprint_history_items="[{}]")
    assert validate_parameters(form, SimpleNamespace(filename="sample.xlsx")) == []
