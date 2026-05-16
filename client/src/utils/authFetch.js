const authFetch = (url, options = {}) => {
  const token = localStorage.getItem('token');
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
