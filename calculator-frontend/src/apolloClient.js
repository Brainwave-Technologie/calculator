import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ApolloLink } from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';

const httpLink =new HttpLink({
  uri: import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql',
  credentials: 'include'
});

// default headers / auth (if any)
const authLink = new SetContextLink((_, { headers }) => {
  // TODO: attach auth token if needed
  return {
    headers: {
      ...headers
    }
  };
});

const errorLink = new ErrorLink(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) graphQLErrors.forEach(({ message, locations, path }) => console.error(`[GraphQL error] ${message}`));
  if (networkError) console.error(`[Network error]`, networkError);
});

const link =ApolloLink.from([errorLink, authLink, httpLink]);

export const client = new ApolloClient({
  link,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          costing: {
            keyArgs: ['month', 'year']
          }
        }
      }
    }
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network', // UI sees cached result first if available, then network refresh
      errorPolicy: 'all'
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all'
    },
    mutate: {
      errorPolicy: 'all'
    }
  }
});
