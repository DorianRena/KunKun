FROM python:3.12-slim

RUN pip install reportlab

RUN apt-get update && apt-get install -y locales

RUN sed -i '/fr_FR.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG fr_FR.UTF-8
ENV LANGUAGE fr_FR:fr
ENV LC_ALL fr_FR.UTF-8

COPY generate_report.py /src/generate_report.py

COPY logo.png /src/logo.png