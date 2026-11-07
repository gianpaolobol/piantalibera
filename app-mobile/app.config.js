// Come in Fungo Italia: l'ID del progetto Expo arriva da EXPO_PROJECT_ID (variabile del repository),
// così il file resta valido anche prima di collegare il progetto.
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PROJECT_ID;
  return projectId ? { ...config, owner: "gianpaolobol", extra: { ...config.extra, eas: { projectId } } } : config;
};
