// Test/demo-only property adapter. Never imported by production entry points.
module.exports.attachPropertyRepository = (db, { state = {}, persist = () => {} } = {}) => {
  for (const key of ['properties', 'floors', 'rooms']) {
    if (state[key] === undefined) state[key] = [];
    if (!Array.isArray(state[key])) throw new Error('Invalid local property state');
  }
  const list = (key, userId, propertyId) => structuredClone(state[key].filter(row => row.userId === userId &&
    (propertyId === undefined || row.propertyId === propertyId)));
  const patch = (key, userId, id, changes) => {
    const row = state[key].find(item => item.id === id && item.userId === userId);
    if (!row) return null;
    Object.assign(row, structuredClone(changes)); persist(); return structuredClone(row);
  };
  const remove = (key, userId, predicate) => {
    const before = state[key].length;
    state[key] = state[key].filter(row => !(row.userId === userId && predicate(row)));
    persist(); return state[key].length < before;
  };
  const methods = {
    listProperties: async userId => list('properties', userId),
    insertProperty: async row => {
      if (row.legacyDefault && state.properties.some(item => item.userId === row.userId && item.legacyDefault)) throw new Error('E11000 duplicate key');
      state.properties.push(structuredClone(row)); persist();
    },
    updateProperty: async (userId, id, changes) => patch('properties', userId, id, changes),
    setPrimaryProperty: async (userId, id) => { for (const row of state.properties) if (row.userId === userId) row.isPrimary = row.id === id; persist(); },
    deleteProperty: async (userId, id) => remove('properties', userId, row => row.id === id),
    listFloors: async (userId, propertyId) => list('floors', userId, propertyId),
    insertFloor: async row => { state.floors.push(structuredClone(row)); persist(); },
    updateFloor: async (userId, id, changes) => patch('floors', userId, id, changes),
    deleteFloors: async (userId, propertyId, id) => { remove('floors', userId, row => row.propertyId === propertyId && (!id || row.id === id)); },
    listRooms: async (userId, propertyId) => list('rooms', userId, propertyId),
    insertRoom: async row => { state.rooms.push(structuredClone(row)); persist(); },
    updateRoom: async (userId, id, changes) => patch('rooms', userId, id, changes),
    deleteRooms: async (userId, propertyId, id) => { remove('rooms', userId, row => row.propertyId === propertyId && (!id || row.id === id)); },
    countRoomsByProperty: async userId => list('rooms', userId).reduce((counts, row) => {
      counts[row.propertyId] = (counts[row.propertyId] || 0) + 1; return counts;
    }, {}),
    moveAppliances: async (userId, filter, target) => {
      let count = 0;
      for (const row of await db.listAppliances(userId)) {
        if (filter.propertyId === null && row.propertyId != null) continue;
        if (filter.propertyId && row.propertyId !== filter.propertyId) continue;
        if (filter.roomId && row.roomId !== filter.roomId) continue;
        if (filter.unassignedOnly && row.roomId != null) continue;
        if (await db.updateAppliance(userId, { ...row, ...target })) count++;
      }
      return count;
    },
    isAdmin: async () => false,
  };
  for (const [name, method] of Object.entries(methods)) if (!db[name]) db[name] = method;
  return db;
};
