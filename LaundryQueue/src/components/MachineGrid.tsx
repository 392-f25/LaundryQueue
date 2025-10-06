import { useContext, useState } from 'react';
import { QueueContext } from '../context/QueueContext';
import { MachineCard } from './MachineCard';
import { MachineTypeFilter } from './MachineTypeFilter';

export const MachineGrid = () => {
  const ctx = useContext(QueueContext);
  const [selectedType, setSelectedType] = useState<'all' | 'washer' | 'dryer'>('all');

  if (!ctx) return null;
  const { machines } = ctx;

  console.log('Selected type:', selectedType);
  console.log('All machines:', machines);
  
  const filteredMachines = machines.filter(m => {
    if (selectedType === 'all') return true;
    const isWasher = m.label.startsWith('W');
    const isDryer = m.label.startsWith('D');
    const shouldShow = selectedType === 'washer' ? isWasher : isDryer;
    console.log(`Machine ${m.label}: ${shouldShow ? 'showing' : 'hiding'}`);
    return shouldShow;
  });

  console.log('Filtered machines:', filteredMachines);

  return (
    <div>
      <MachineTypeFilter 
        selectedType={selectedType}
        onTypeChange={setSelectedType}
      />
      <div className="machine-grid-2x3">
        {filteredMachines.map((m) => (
          <MachineCard key={m.id} machine={m} />
        ))}
      </div>
    </div>
  );
};
