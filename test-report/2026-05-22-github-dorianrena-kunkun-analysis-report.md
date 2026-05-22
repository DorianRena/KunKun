# Code analysis
## github:dorianrena:kunkun 
#### Branch main
#### Version not provided 

**By: Kunkun**

*Date: 2026-05-22*

*Analyzed the: 2026-05-22*

## Introduction
This document contains results of the code analysis of github:dorianrena:kunkun



## Configuration

- Quality Profiles
    - Names: Sonar way [JavaScript]; 
    - Files: 74e07d08-7ffe-41ef-be45-e4b8e565aa87.json; 


 - Quality Gate
    - Name: Sonar way
    - File: Sonar way.xml

## Synthesis

### Analysis Status

Reliability | Security | Security Review | Maintainability |
:---:|:---:|:---:|:---:
A | A | E | A |

### Quality gate status

| Quality Gate Status | ERROR |
|-|-|

Métrique|Valeur
---|---
Coverage on New Code|ERROR (0.0% is less than 80%)
Duplicated Lines (%) on New Code|ERROR (6.3% is greater than 3%)
New Issues|ERROR (10 is greater than 0)


### Metrics

Coverage | Duplications | Comment density | Median number of lines of code per file | Adherence to coding standard |
:---:|:---:|:---:|:---:|:---:
0.0 % | 2.2 % | 7.3 % | 62.0 | 99.6 %

### Tests

Total | Success Rate | Skipped | Errors | Failures |
:---:|:---:|:---:|:---:|:---:
0 | 0 % | 0 | 0 | 0

### Detailed technical debt

Fiabilité|Sécurité|Maintenabilité|Total
---|---|---|---
-|-|0d 2h 4min|0d 2h 4min


### Metrics Range

\ | Cyclomatic Complexity | Cognitive Complexity | Lines of code per file | Coverage | Comment density (%) | Duplication (%)
:---|:---:|:---:|:---:|:---:|:---:|:---:
Min | 0.0 | 0.0 | 5.0 | 0.0 | 0.0 | 0.0
Max | 229.0 | 193.0 | 1214.0 | 0.0 | 31.6 | 25.0

### Volume

Langage|Nombre
---|---
JavaScript|1806
Total|1806


## Issues

### Issues count by severity and types

Type / Criticité|INFO|MINOR|MAJOR|CRITICAL|BLOCKER
---|---|---|---|---|---
BUG|0|0|0|0|0
VULNERABILITY|0|0|0|0|0
CODE_SMELL|1|12|10|1|0


### Issues List

Nom|Description|Type|Criticité|Nombre
---|---|---|---|---
Cognitive Complexity of functions should not be too high||CODE_SMELL|CRITICAL|1
Track uses of "TODO" tags||CODE_SMELL|INFO|1
Assignments should not be made from within sub-expressions||CODE_SMELL|MAJOR|2
Ternary operators should not be nested||CODE_SMELL|MAJOR|2
Template literals should not be nested||CODE_SMELL|MAJOR|4
Optional chaining should be preferred||CODE_SMELL|MAJOR|2
"RegExp.exec()" should be preferred over "String.match()"||CODE_SMELL|MINOR|1
Negated conditions should be avoided when an else clause is present||CODE_SMELL|MINOR|3
Number static methods and properties should be preferred over global equivalents||CODE_SMELL|MINOR|6
Strings should use "replaceAll()" instead of "replace()" with global regex||CODE_SMELL|MINOR|2


## Security Hotspots

### Security hotspots count by category and priority

Catégorie / Priorité|LOW|MEDIUM|HIGH
---|---|---|---
LDAP Injection|0|0|0
Object Injection|0|0|0
Server-Side Request Forgery (SSRF)|0|0|0
XML External Entity (XXE)|0|0|0
Insecure Configuration|0|0|0
XPath Injection|0|0|0
Authentication|0|0|0
Weak Cryptography|0|1|0
Denial of Service (DoS)|0|1|0
Log Injection|0|0|0
Cross-Site Request Forgery (CSRF)|0|0|0
Open Redirect|0|0|0
Permission|0|0|0
SQL Injection|0|0|0
Encryption of Sensitive Data|1|0|0
Traceability|0|0|0
Buffer Overflow|0|0|0
File Manipulation|0|0|0
Code Injection (RCE)|0|0|0
Cross-Site Scripting (XSS)|0|0|0
Command Injection|0|0|0
Path Traversal Injection|0|0|0
HTTP Response Splitting|0|0|0
Others|0|0|0


### Security hotspots

Catégorie|Nom|Priorité|Criticité|Total
---|---|---|---|---
Denial of Service (DoS)|Using slow regular expressions is security-sensitive|MEDIUM|CRITICAL|1
Weak Cryptography|Using pseudorandom number generators (PRNGs) is security-sensitive|MEDIUM|CRITICAL|1
Encryption of Sensitive Data|Using clear-text protocols is security-sensitive|LOW|CRITICAL|1

