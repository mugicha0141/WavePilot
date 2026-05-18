import { getToken } from "../auth";

const authFetch = async (url, options = {}) => {
  const token = await getToken();
  const { headers = {}, ...rest } = options;
  return fetch(url, {
    ...rest,
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

export default authFetch;
