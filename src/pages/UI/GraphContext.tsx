import React, {
  createContext,
  useState,
  useCallback,
  useContext,
  ReactNode
} from 'react'
import { notifications } from '@mantine/notifications'
import { DraggableNode, NodeDefinition } from '../../components/types/NodeDefinition'
import { AppFile } from '../../App'
import { nanoid } from 'nanoid'
import { nodeActions as nodeRegistry } from '../../components/nodeRegistry';

export const FUNC_PREFIX = 'func:'
export const EVENT_PREFIX = 'event:'

export type FunctionScope = 'client' | 'server' | 'shared'
export type EventScope = 'client' | 'server'

export interface GraphData {
  nodes: DraggableNode[]
  parameters?: string[] // For functions
  argumentNames?: string[] // For events
  scope?: FunctionScope | EventScope
}

export interface ProjectMetadata {
  savedAt: string
  appName: string
  appVersion: string
}

export interface ProjectSaveData {
  projectMetadata: ProjectMetadata
  files: AppFile[]
  graphs: Record<string, GraphData>
}

// --- Context State and Actions ---
export interface GraphContextState {
  graphs: Record<string, GraphData>
  files: AppFile[] // <<< ADDED: Centralized file list
  isDirty: boolean
}

export interface GraphContextActions {
  // Graph node modification
  addNodeToGraph: (graphKey: string, nodeTemplate: DraggableNode) => void
  reorderNodes: (graphKey: string, from: number, to: number) => void
  updateNode: (
    graphKey: string,
    nodeIndex: number,
    updatedNode: DraggableNode
  ) => void
  deleteNodeFromGraph: (graphKey: string, nodeIndex: number) => void

  // File/Function/Event graph management
  addFile: (file: AppFile) => boolean // <<< REVISED
  deleteFile: (file: AppFile) => void // <<< REVISED

  addFunctionGraph: (
    funcName: string,
    scope: FunctionScope,
    parameters?: string[]
  ) => boolean
  addEventGraph: (
    eventName: string,
    scope: EventScope,
    argumentNames?: string[]
  ) => boolean
  deleteGraph: (graphKey: string) => void
  getGraph: (graphKey: string) => GraphData | undefined

  // Settings updates
  updateFunctionSettings: (
    graphKey: string,
    parameters: string[],
    scope: FunctionScope
  ) => void
  updateEventSettings: (
    graphKey: string,
    argumentNames: string[],
    scope: EventScope
  ) => void

  // Getters
  getFunctionNames: () => string[]
  getEventNames: () => string[]
  getAllFileKeys: () => string[] // Helper to get all non-function/event keys

  // Project Save/Load
  loadProject: (
    projectData: ProjectSaveData
  ) => { success: boolean; message?: string } // <<< REVISED
  clearDirtyFlag: () => void
}

export type GraphContextType = GraphContextState & GraphContextActions

const GraphContext = createContext<GraphContextType | undefined>(undefined)

export const GraphProvider = ({ children }: { children: ReactNode }) => {
  const [graphs, setGraphs] = useState<Record<string, GraphData>>({})
  const [files, setFiles] = useState<AppFile[]>([]) // <<< ADDED
  const [isDirty, setIsDirty] = useState(false)

  const clearDirtyFlag = useCallback(() => {
    console.log('GraphContext: Clearing dirty flag')
    setIsDirty(false)
  }, [])

  // --- MUTATOR FUNCTIONS ---

  const addNodeToGraph = useCallback(
    (graphKey: string, nodeTemplate: DraggableNode) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph) {
          console.warn(`Graph not found for key: ${graphKey} in addNodeToGraph`)
          return prev
        }
        const newNodeInstance: DraggableNode = {
          ...nodeTemplate,
          runtimeId: nanoid(10) // Ensure each node instance has a unique runtimeId
        }
        return {
          ...prev,
          [graphKey]: { ...graph, nodes: [...graph.nodes, newNodeInstance] }
        }
      })
      console.log('GraphContext: Setting dirty flag (addNodeToGraph)')
      setIsDirty(true)
    },
    []
  )

  const reorderNodes = useCallback(
    (graphKey: string, from: number, to: number) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph || !graph.nodes) return prev
        const newNodes = Array.from(graph.nodes)
        const [movedItem] = newNodes.splice(from, 1)
        if (movedItem) newNodes.splice(to, 0, movedItem)
        return { ...prev, [graphKey]: { ...graph, nodes: newNodes } }
      })
      console.log('GraphContext: Setting dirty flag (reorderNodes)')
      setIsDirty(true)
    },
    []
  )

  const updateNode = useCallback(
    (graphKey: string, nodeIndex: number, updatedNode: DraggableNode) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph || !graph.nodes || !graph.nodes[nodeIndex]) return prev
        const newNodes = [...graph.nodes]
        newNodes[nodeIndex] = updatedNode
        return { ...prev, [graphKey]: { ...graph, nodes: newNodes } }
      })
      console.log('GraphContext: Setting dirty flag (updateNode)')
      setIsDirty(true)
    },
    []
  )

  const deleteNodeFromGraph = useCallback(
    (graphKey: string, nodeIndex: number) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph || !graph.nodes || !graph.nodes[nodeIndex]) return prev
        const nodeLabel = graph.nodes[nodeIndex]?.label || 'Node'
        const newNodes = graph.nodes.filter((_, index) => index !== nodeIndex)
        
        notifications.show({
            title: 'Node Deleted',
            message: `Node "${nodeLabel}" removed.`,
            color: 'orange',
            autoClose: 2000,
        });
        return { ...prev, [graphKey]: { ...graph, nodes: newNodes } }
      })
      console.log('GraphContext: Setting dirty flag (deleteNodeFromGraph)')
      setIsDirty(true)
    },
    []
  )

  const addFile = useCallback(
    (fileToAdd: AppFile): boolean => {
      const fileKey = `${fileToAdd.type}/${fileToAdd.name}`;
      if (graphs[fileKey] || files.some(f => f.name.toLowerCase() === fileToAdd.name.toLowerCase() && f.type === fileToAdd.type)) {
        notifications.show({ title: 'File Exists', message: `File "${fileToAdd.name}.lua" (${fileToAdd.type}) already exists.`, color: 'yellow', autoClose: 3500 });
        return false;
      }

      setGraphs(prev => ({ ...prev, [fileKey]: { nodes: [], scope: fileToAdd.type } }));
      setFiles(prev => [...prev, fileToAdd]);

      console.log('GraphContext: Setting dirty flag (addFile)');
      setIsDirty(true);
      return true;
    },
    [graphs, files]
  );

  const deleteFile = useCallback(
    (fileToDelete: AppFile) => {
      const fileKey = `${fileToDelete.type}/${fileToDelete.name}`;
      
      setGraphs(prev => {
        const newGraphs = { ...prev };
        delete newGraphs[fileKey];
        return newGraphs;
      });
      setFiles(prev => prev.filter(f => !(f.name === fileToDelete.name && f.type === fileToDelete.type)));

      console.log('GraphContext: Setting dirty flag (deleteFile)');
      setIsDirty(true);
    },
    []
  );

  const addFunctionGraph = useCallback(
    (
      funcName: string,
      scope: FunctionScope,
      parameters: string[] = []
    ): boolean => {
      const graphKey = `${FUNC_PREFIX}${funcName}`
      if (graphs[graphKey]) {
        return false
      }
      setGraphs(prev => ({
        ...prev,
        [graphKey]: { nodes: [], parameters, scope }
      }))
      console.log('GraphContext: Setting dirty flag (addFunctionGraph)')
      setIsDirty(true)
      return true
    },
    [graphs]
  )

  const addEventGraph = useCallback(
    (
      eventName: string,
      scope: EventScope,
      argumentNames: string[] = []
    ): boolean => {
      const graphKey = `${EVENT_PREFIX}${eventName}`
      if (graphs[graphKey]) {
        return false
      }
      setGraphs(prev => ({
        ...prev,
        [graphKey]: { nodes: [], argumentNames, scope }
      }))
      console.log('GraphContext: Setting dirty flag (addEventGraph)')
      setIsDirty(true)
      return true
    },
    [graphs]
  )

  const deleteGraph = useCallback((graphKey: string) => {
    setGraphs(prev => {
      const newGraphs = { ...prev };
      delete newGraphs[graphKey];
      return newGraphs;
    })
    console.log('GraphContext: Setting dirty flag (deleteGraph)')
    setIsDirty(true)
  }, [])

  const getGraph = useCallback(
    (graphKey: string): GraphData | undefined => {
      return graphs[graphKey]
    },
    [graphs]
  )

  const updateFunctionSettings = useCallback(
    (graphKey: string, parameters: string[], scope: FunctionScope) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph) return prev
        return {
          ...prev,
          [graphKey]: { ...graph, parameters, scope }
        }
      })
      console.log('GraphContext: Setting dirty flag (updateFunctionSettings)')
      setIsDirty(true)
    },
    []
  )

  const updateEventSettings = useCallback(
    (graphKey: string, argumentNames: string[], scope: EventScope) => {
      setGraphs(prev => {
        const graph = prev[graphKey]
        if (!graph) return prev
        return {
          ...prev,
          [graphKey]: { ...graph, argumentNames, scope }
        }
      })
      console.log('GraphContext: Setting dirty flag (updateEventSettings)')
      setIsDirty(true)
    },
    []
  )

  const getFunctionNames = useCallback(() => {
    return Object.keys(graphs)
      .filter(key => key.startsWith(FUNC_PREFIX))
      .map(key => key.substring(FUNC_PREFIX.length))
  }, [graphs])

  const getEventNames = useCallback(() => {
    return Object.keys(graphs)
      .filter(key => key.startsWith(EVENT_PREFIX))
      .map(key => key.substring(EVENT_PREFIX.length))
  }, [graphs])
  
  const getAllFileKeys = useCallback(() => {
    return Object.keys(graphs).filter(
      key => !key.startsWith(FUNC_PREFIX) && !key.startsWith(EVENT_PREFIX)
    );
  }, [graphs]);

  const loadProject = useCallback(
    (
      projectData: ProjectSaveData
    ): { success: boolean; message?: string } => {
      try {
        if (
          !projectData ||
          !projectData.graphs ||
          !projectData.files ||
          !projectData.projectMetadata
        ) {
          throw new Error('Invalid project data structure.')
        }

        const loadedGraphsData: Record<string, GraphData> = {};
        for (const graphKey in projectData.graphs) {
          if (Object.prototype.hasOwnProperty.call(projectData.graphs, graphKey)) {
            const savedGraphData = projectData.graphs[graphKey];
            if (!savedGraphData) continue;

            const rehydratedNodes: DraggableNode[] = (savedGraphData.nodes || []).map(savedNode => {
              const nodeDefinitionFromRegistry = nodeRegistry.find(def => def.id === savedNode.id);
              
              if (!nodeDefinitionFromRegistry) {
                console.warn(`GraphContext: Could not find node definition for id '${savedNode.id}' during load. Skipping node.`);
                notifications.show({
                    title: 'Load Warning',
                    message: `Node type "${savedNode.id}" (label: ${savedNode.label || 'N/A'}) is no longer available or has an invalid ID. It will be removed from the graph.`,
                    color: 'orange',
                    autoClose: 7000,
                });
                return null; // Skip this node
              }

              const nodeSpecificSavedProps = { ...savedNode } as Partial<DraggableNode>;
              delete nodeSpecificSavedProps.id; 
              
              const rehydratedNode: DraggableNode = {
                ...nodeDefinitionFromRegistry,
                ...nodeSpecificSavedProps,
                runtimeId: nanoid(10),
                id: nodeDefinitionFromRegistry.id, 
                leftSection: nodeDefinitionFromRegistry.leftSection,
                execute: nodeDefinitionFromRegistry.execute,
                category: nodeDefinitionFromRegistry.category,
                allowedGraphTypes: nodeDefinitionFromRegistry.allowedGraphTypes,
              };
              return rehydratedNode;
            }).filter(node => node !== null) as DraggableNode[];

            loadedGraphsData[graphKey] = {
              ...savedGraphData,
              nodes: rehydratedNodes,
            };
          }
        }
        setGraphs(loadedGraphsData);
        setFiles(projectData.files); // <<< SET FILES
        console.log('GraphContext: Clearing dirty flag (loadProject)')
        setIsDirty(false); // <<< CLEAR DIRTY ON SUCCESSFUL LOAD
        return { success: true }
      } catch (error: any) {
        console.error('Error loading project into context:', error)
        notifications.show({
          title: 'Project Load Error',
          message: `Failed to load project data into context: ${error.message}`,
          color: 'red'
        })
        return {
          success: false,
          message: error.message || 'Unknown error during project load.'
        }
      }
    },
    []
  )

  const contextValue: GraphContextType = {
    graphs,
    files,
    isDirty,
    addNodeToGraph,
    reorderNodes,
    updateNode,
    deleteNodeFromGraph,
    addFile,
    deleteFile,
    addFunctionGraph,
    addEventGraph,
    deleteGraph,
    getGraph,
    updateFunctionSettings,
    updateEventSettings,
    getFunctionNames,
    getEventNames,
    getAllFileKeys,
    loadProject,
    clearDirtyFlag
  }

  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  )
}

export const useGraphContext = () => {
  const context = useContext(GraphContext)
  if (context === undefined) {
    throw new Error('useGraphContext must be used within a GraphProvider')
  }
  return context
}