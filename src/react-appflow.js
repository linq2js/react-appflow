import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  createElement,
  memo
} from "react";

const defaultSelector = value => value;
const customUseMemo = useMemo;

export function connectFlow(flow, mapper) {
  return comp => {
    const memoizedComp = memo(comp);
    return memo(props => {
      const hook = useFlow(flow);
      return createElement(memoizedComp, mapper(hook, props));
    });
  };
}

export function compose(...functions) {
  if (functions.length === 0) {
    return arg => arg;
  }

  if (functions.length === 1) {
    return functions[0];
  }

  return functions.reduce((a, b) => (...args) => a(b(...args)));
}

export function useFlow(flow) {
  const selectorsRef = useRef([]);
  const prevValuesRef = useRef();
  const lastErrorRef = useRef();
  const actionNames = flow.actionNames();
  const [, forceRerender] = useState();
  const select = useCallback(
    selector => {
      if (typeof selector === "string") {
        return flow.getState()[selector];
      }
      return selector(flow.getState());
    },
    [flow]
  );
  const hookDeps = [actionNames].concat(select);
  const hook = customUseMemo(() => {
    const result = {
      can(...actionNames) {
        const result = actionNames.map(flow.can);
        return result.length === 1 ? result[0] : result;
      },
      dispatch: flow.dispatch,
      callback: flow.callback,
      get state() {
        selectorsRef.current.push(defaultSelector);
        const value = select(defaultSelector);
        prevValuesRef.current.push(value);
        return value;
      },
      get(...selectors) {
        const result = selectors.map(selector => {
          selectorsRef.current.push(selector);
          const value = select(selector);
          prevValuesRef.current.push(value);
          return value;
        });
        return result.length === 1 ? result[0] : result;
      }
    };

    actionNames.forEach(action => {
      if (action in result) return;
      Object.defineProperty(result, action, {
        get() {
          return flow.callback(action);
        }
      });
    });

    return result;
  }, hookDeps);

  useEffect(() => {
    const checkForUpdates = () => {
      try {
        const currentValues = selectorsRef.current.map(select);
        if (
          prevValuesRef.current.length !== currentValues.length ||
          prevValuesRef.current.some(
            (value, index) => value !== currentValues[index]
          )
        ) {
          forceRerender({});
        }
      } catch (ex) {
        lastErrorRef.current = ex;
        forceRerender({});
      }
    };

    checkForUpdates();

    return flow.subscribe(checkForUpdates);
  }, [select, flow]);

  selectorsRef.current = [];
  prevValuesRef.current = [];

  if (lastErrorRef.current) {
    const lastError = lastErrorRef.current;
    lastErrorRef.current = undefined;
    throw lastError;
  }

  return hook;
}
