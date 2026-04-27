PORT     ?= 3000
ADMIN_PASSWORD ?= admin

.PHONY: install start test seed

install:
	npm install

start:
	PORT=$(PORT) node server.js

test:
	ADMIN_PASSWORD=$(ADMIN_PASSWORD) bash test.sh http://localhost:$(PORT)

seed:
	ADMIN_PASSWORD=$(ADMIN_PASSWORD) bash test.sh seed http://localhost:$(PORT)
