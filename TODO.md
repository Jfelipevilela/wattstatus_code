# TODO: Consolidate to Two TXT Files (users.txt and appliances.txt)

- [x] Update server.cjs to use single appliances.txt file
- [x] Modify GET /api/appliances/:userId to filter from appliances.txt by userId
- [x] Modify POST /api/appliances/:userId to append to appliances.txt with userId
- [x] Modify PUT /api/appliances/:userId/:applianceId to update in appliances.txt
- [x] Modify DELETE /api/appliances/:userId/:applianceId to remove from appliances.txt
- [x] Ensure appliances include userId in JSON structure
- [x] Test main routes (not admin)
