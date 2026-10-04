"""Optimization: vehicle routing (OR-Tools CP solver) and EV charging schedules (OR-Tools GLOP LP).

The solver modules work on plain dataclasses and know nothing about the database, so they can
be tested and reasoned about on their own. `service.py` translates between them and the app.
"""
